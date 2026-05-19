"""
Сервис напоминаний о задачах с дедлайном.

Алгоритм:
  - Каждый день ровно в 09:00 МСК проверяет задачи со сроком «завтра».
  - Отправляет Telegram-сообщение + анимацию владельцу каждой такой задачи.
  - Дубли предотвращаются через bot/data/sent_reminders.json
    (ключ = "{task_id}:{deadline_date}").
  - Файл автоматически очищается от записей старше 7 дней.
"""

import asyncio
import json
import logging
import math
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from aiogram import Bot
from aiogram.types import FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup

from config import APP_URL
from database import get_tasks_due_tomorrow, get_user_by_id

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────

_BOT_DIR       = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DATA_DIR      = os.path.join(_BOT_DIR, "data")
_SENT_FILE     = os.path.join(_DATA_DIR, "sent_reminders.json")
_REMINDER_GIF  = os.path.join(_BOT_DIR, "assets", "reminder_animation.gif")

# ── Config ────────────────────────────────────────────────────────────────────

MSK            = ZoneInfo("Europe/Moscow")
REMINDER_HOUR  = 9          # 09:00 МСК


# ── Duplicate-prevention helpers ──────────────────────────────────────────────

def _load_sent() -> set[str]:
    os.makedirs(_DATA_DIR, exist_ok=True)
    if not os.path.isfile(_SENT_FILE):
        return set()
    try:
        with open(_SENT_FILE, "r", encoding="utf-8") as fh:
            return set(json.load(fh).get("sent", []))
    except Exception as exc:
        logger.warning(f"Reminder: не удалось прочитать {_SENT_FILE}: {exc}")
        return set()


def _save_sent(sent: set[str]) -> None:
    os.makedirs(_DATA_DIR, exist_ok=True)
    cutoff = (date.today() - timedelta(days=7)).isoformat()
    pruned = {k for k in sent if k.split(":", 1)[1] >= cutoff}
    try:
        with open(_SENT_FILE, "w", encoding="utf-8") as fh:
            json.dump({"sent": sorted(pruned)}, fh, ensure_ascii=False)
    except Exception as exc:
        logger.error(f"Reminder: не удалось сохранить {_SENT_FILE}: {exc}")


def _reminder_key(task_id: str, deadline_date: str) -> str:
    return f"{task_id}:{deadline_date[:10]}"


# ── Formatting helpers ────────────────────────────────────────────────────────

_MONTHS_RU = [
    "янв", "фев", "мар", "апр", "мая", "июн",
    "июл", "авг", "сен", "окт", "ноя", "дек",
]


def _fmt_date_ru(iso: str) -> str:
    try:
        d = date.fromisoformat(iso[:10])
        return f"{d.day} {_MONTHS_RU[d.month - 1]} {d.year}"
    except Exception:
        return iso


# ── Core send logic ───────────────────────────────────────────────────────────

async def send_reminders(bot: Bot) -> None:
    """Отправляет напоминания для всех активных задач со сроком завтра."""
    sent = _load_sent()
    tasks = await get_tasks_due_tomorrow()

    if not tasks:
        logger.info("Reminder: задач со сроком завтра не найдено — пропускаем")
        return

    logger.info(f"Reminder: найдено {len(tasks)} задач(и) со сроком завтра")

    sent_count = skipped = errors = 0

    for task in tasks:
        task_id  = str(task.get("id", ""))
        deadline = task.get("deadline", "")
        key      = _reminder_key(task_id, deadline)

        # ── Duplicate guard ────────────────────────────────────────────────
        if key in sent:
            skipped += 1
            continue

        # ── Resolve Telegram user: tg_tasks.user_id → tg_users.telegram_id
        user_id = task.get("user_id")
        if not user_id:
            logger.warning(f"Reminder: задача {task_id} без user_id — пропускаем")
            continue

        user = await get_user_by_id(str(user_id))
        if not user:
            logger.warning(f"Reminder: пользователь {user_id} не найден — пропускаем")
            continue

        telegram_id = user.get("telegram_id")
        if not telegram_id:
            logger.warning(f"Reminder: нет telegram_id у пользователя {user_id}")
            continue

        # ── Build message ──────────────────────────────────────────────────
        title    = task.get("title") or "Без названия"
        cat_data = task.get("tg_categories") or {}
        category = cat_data.get("name", "—") if isinstance(cat_data, dict) else "—"
        date_ru  = _fmt_date_ru(deadline)

        board_url = f"{APP_URL}?tg_id={telegram_id}" if APP_URL else ""
        keyboard  = None
        if board_url:
            keyboard = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="📋 Открыть задачу", url=board_url)
            ]])

        text = (
            f"⏰ <b>Завтра срок задачи</b>\n\n"
            f"📝 {title}\n"
            f"🏷 {category}\n"
            f"📅 {date_ru}"
        )

        # ── Send ───────────────────────────────────────────────────────────
        try:
            await bot.send_message(
                chat_id=telegram_id,
                text=text,
                parse_mode="HTML",
                reply_markup=keyboard,
            )
            if os.path.isfile(_REMINDER_GIF):
                await bot.send_animation(
                    chat_id=telegram_id,
                    animation=FSInputFile(_REMINDER_GIF),
                )

            sent.add(key)
            _save_sent(sent)
            sent_count += 1
            logger.info(
                f"Reminder отправлен: task_id={task_id}, telegram_id={telegram_id}"
            )

        except Exception as exc:
            errors += 1
            logger.error(
                f"Reminder: ошибка отправки task_id={task_id}, "
                f"telegram_id={telegram_id}: {exc}"
            )

    logger.info(
        f"Reminder итог: отправлено={sent_count}, "
        f"пропущено(дубль)={skipped}, ошибок={errors}"
    )


# ── Scheduler ─────────────────────────────────────────────────────────────────

async def reminder_scheduler(bot: Bot) -> None:
    """
    Асинхронный планировщик напоминаний.

    Вычисляет точное время до следующего 09:00 МСК и засыпает ровно до него.
    Это означает:
      - Если бот запущен до 09:00 — напоминания уйдут сегодня в 09:00.
      - Если бот запущен после 09:00 — напоминания уйдут завтра в 09:00.
      - JSON-файл sent_reminders.json исключает дубли при рестарте.
    """
    logger.info("Reminder scheduler запущен — ежедневно в 09:00 МСК")

    while True:
        now_msk = datetime.now(MSK)

        # Next 09:00 MSK
        target = now_msk.replace(hour=REMINDER_HOUR, minute=0,
                                 second=0, microsecond=0)
        if now_msk >= target:
            target += timedelta(days=1)

        wait_secs = (target - now_msk).total_seconds()
        logger.info(
            f"Reminder: следующий запуск {target.strftime('%Y-%m-%d %H:%M')} МСК "
            f"(через {wait_secs / 3600:.1f}ч)"
        )

        await asyncio.sleep(wait_secs)

        try:
            logger.info("Reminder: проверяем задачи со сроком завтра...")
            await send_reminders(bot)
        except Exception as exc:
            logger.error(f"Reminder scheduler — ошибка send_reminders: {exc}")

        # Pause 90 s so the next loop iteration recalculates for the next day
        await asyncio.sleep(90)
