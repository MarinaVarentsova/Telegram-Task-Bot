"""
Точка входа Telegram-бота для управления задачами.

Режимы запуска (переменная окружения BOT_MODE):
  polling  — локальная/дев-разработка (по умолчанию)
  webhook  — продакшн: Telegram шлёт апдейты на WEBHOOK_URL,
             бот слушает на localhost:WEBHOOK_INTERNAL_PORT
"""

import asyncio
import logging
import sys

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from config import (
    TELEGRAM_BOT_TOKEN,
    BOT_MODE,
    WEBHOOK_URL,
    WEBHOOK_INTERNAL_PORT,
)
from database import log_startup_check
from handlers import commands, messages
from services.reminder_service import reminder_scheduler


def setup_logging() -> None:
    """Настраивает логирование с форматом timestamp + уровень + сообщение."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    logging.getLogger("aiogram").setLevel(logging.WARNING)
    logging.getLogger("aiohttp").setLevel(logging.WARNING)


def _make_bot_and_dp() -> tuple[Bot, Dispatcher]:
    """Создаёт экземпляры Bot и Dispatcher с подключёнными роутерами."""
    bot = Bot(
        token=TELEGRAM_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(commands.router)
    dp.include_router(messages.router)
    return bot, dp


# ── Polling mode ───────────────────────────────────────────────────────────────

async def run_polling(bot: Bot, dp: Dispatcher, logger: logging.Logger) -> None:
    """Запускает бота в режиме polling (для локальной разработки)."""
    logger.info("Режим: POLLING — бот сам опрашивает Telegram API")
    scheduler_task = asyncio.create_task(reminder_scheduler(bot))
    try:
        await dp.start_polling(bot, skip_updates=True)
    except Exception as e:
        logger.error(f"Критическая ошибка в polling: {e}")
        raise
    finally:
        scheduler_task.cancel()
        await bot.session.close()
        logger.info("Бот (polling) остановлен.")


# ── Webhook mode ───────────────────────────────────────────────────────────────

async def run_webhook(bot: Bot, dp: Dispatcher, logger: logging.Logger) -> None:
    """
    Запускает бота в режиме webhook (продакшн).

    1. Регистрирует WEBHOOK_URL в Telegram.
    2. Запускает внутренний aiohttp-сервер на WEBHOOK_INTERNAL_PORT.
       Express проксирует POST /api/telegram-webhook → localhost:WEBHOOK_INTERNAL_PORT.
    """
    from aiohttp import web
    from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application

    if not WEBHOOK_URL:
        raise EnvironmentError(
            "WEBHOOK_URL не задан. "
            "Установите переменную окружения WEBHOOK_URL для webhook-режима."
        )

    logger.info(f"Режим: WEBHOOK")
    logger.info(f"Webhook URL: {WEBHOOK_URL}")
    logger.info(f"Внутренний порт aiohttp: {WEBHOOK_INTERNAL_PORT}")

    # Регистрируем webhook в Telegram
    try:
        await bot.set_webhook(WEBHOOK_URL, drop_pending_updates=True)
        info = await bot.get_webhook_info()
        logger.info(f"Webhook успешно установлен: url={info.url}, pending={info.pending_update_count}")
    except Exception as e:
        logger.error(f"Ошибка установки webhook: {e}")
        raise

    # Запускаем aiohttp-сервер для приёма апдейтов от Telegram через Express-прокси
    aio_app = web.Application()
    SimpleRequestHandler(dispatcher=dp, bot=bot).register(aio_app, path="/")
    setup_application(aio_app, dp, bot=bot)

    runner = web.AppRunner(aio_app)
    await runner.setup()
    site = web.TCPSite(runner, host="127.0.0.1", port=WEBHOOK_INTERNAL_PORT)

    scheduler_task = None
    site_started = False          # guard: only delete webhook if WE bound the port
    try:
        await site.start()
        site_started = True
        logger.info(f"aiohttp webhook-сервер запущен на 127.0.0.1:{WEBHOOK_INTERNAL_PORT}")
        scheduler_task = asyncio.create_task(reminder_scheduler(bot))
        logger.info("Reminder scheduler запущен")
        # Бесконечно ждём (апдейты обрабатываются через aiohttp)
        await asyncio.Event().wait()
    except Exception as e:
        logger.error(f"Критическая ошибка в webhook-сервере: {e}")
        raise
    finally:
        if scheduler_task is not None:
            scheduler_task.cancel()
        await runner.cleanup()
        if site_started:
            # Only delete the webhook when we were the process that bound the port.
            # If site.start() failed (e.g. port busy), another process owns the
            # webhook — removing it here would break that process.
            try:
                await bot.delete_webhook()
                logger.info("Webhook удалён из Telegram.")
            except Exception:
                pass
        await bot.session.close()
        logger.info("Бот (webhook) остановлен.")


# ── Точка входа ────────────────────────────────────────────────────────────────

async def main() -> None:
    setup_logging()
    logger = logging.getLogger(__name__)

    logger.info("Запуск Telegram-бота для управления задачами...")
    log_startup_check()

    bot, dp = _make_bot_and_dp()
    logger.info("Роутеры подключены.")

    if BOT_MODE == "webhook":
        await run_webhook(bot, dp, logger)
    else:
        if BOT_MODE != "polling":
            logger.warning(f"Неизвестный BOT_MODE='{BOT_MODE}', используем polling.")
        await run_polling(bot, dp, logger)


if __name__ == "__main__":
    asyncio.run(main())
