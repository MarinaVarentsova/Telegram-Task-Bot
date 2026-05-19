"""
Конфигурация бота: загрузка переменных окружения.
Все значения читаются из os.environ — не импортировать на уровне модуля,
чтобы не блокировать запуск при отсутствии переменных.
"""

import os
from dotenv import load_dotenv

# Загружаем .env если существует (для локальной разработки)
load_dotenv()


def _require(key: str) -> str:
    """Получает обязательную переменную окружения или бросает ошибку."""
    value = os.getenv(key)
    if not value:
        raise EnvironmentError(f"Обязательная переменная окружения не задана: {key}")
    return value


# Telegram — читается один раз при старте
TELEGRAM_BOT_TOKEN: str = _require("TELEGRAM_BOT_TOKEN")

# URL веб-приложения (бэклог). Необязательный — если не задан, кнопка сообщает об этом.
APP_URL: str = os.getenv("APP_URL", "").strip()

# ── Режим работы бота ──────────────────────────────────────────────────────────
# "polling"  — локальная/дев-разработка (по умолчанию)
# "webhook"  — продакшн: Telegram шлёт апдейты на WEBHOOK_URL
BOT_MODE: str = os.getenv("BOT_MODE", "polling").strip().lower()

# Публичный URL, на который Telegram будет слать апдейты (только для webhook-режима).
# Пример: https://telegram-task-bot.replit.app/api/telegram-webhook
WEBHOOK_URL: str = os.getenv("WEBHOOK_URL", "").strip()

# Внутренний порт aiohttp-сервера бота (только для webhook-режима).
# Express проксирует на localhost:WEBHOOK_INTERNAL_PORT
WEBHOOK_INTERNAL_PORT: int = int(os.getenv("WEBHOOK_INTERNAL_PORT", "8082"))

# Модели AI
TRANSCRIPTION_MODEL: str = "gpt-4o-mini-transcribe"
EXTRACTION_MODEL: str = "gpt-5-mini"

# Настройки задач по умолчанию
DEFAULT_COLUMN_NAME: str = "бэклог"
DEFAULT_CATEGORY_NAME: str = "прочее"
DEFAULT_STATUS: str = "active"
DEFAULT_PRIORITY: str = "normal"
