"""
Точка входа Telegram-бота для управления задачами.
Запускается в режиме polling (MVP).
"""

import asyncio
import logging
import sys
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from config import TELEGRAM_BOT_TOKEN
from database import log_startup_check
from handlers import commands, messages


def setup_logging() -> None:
    """Настраивает логирование с форматом timestamp + уровень + сообщение."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )
    # Снижаем уровень шума от сторонних библиотек
    logging.getLogger("aiogram").setLevel(logging.WARNING)
    logging.getLogger("aiohttp").setLevel(logging.WARNING)


async def main() -> None:
    """Инициализирует и запускает бота."""
    setup_logging()
    logger = logging.getLogger(__name__)

    logger.info("Запуск Telegram-бота для управления задачами...")
    log_startup_check()

    # Создаём бота и диспетчер
    bot = Bot(
        token=TELEGRAM_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()

    # Подключаем роутеры
    dp.include_router(commands.router)
    dp.include_router(messages.router)

    logger.info("Роутеры подключены. Начинаем polling...")

    try:
        # Запускаем polling (удаляем старые обновления при старте)
        await dp.start_polling(bot, skip_updates=True)
    except Exception as e:
        logger.error(f"Критическая ошибка: {e}")
        raise
    finally:
        await bot.session.close()
        logger.info("Бот остановлен.")


if __name__ == "__main__":
    asyncio.run(main())
