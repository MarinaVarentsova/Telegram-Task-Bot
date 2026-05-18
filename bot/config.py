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

# Модели AI
TRANSCRIPTION_MODEL: str = "gpt-4o-mini-transcribe"
EXTRACTION_MODEL: str = "gpt-5-mini"

# Настройки задач по умолчанию
DEFAULT_COLUMN_NAME: str = "бэклог"
DEFAULT_CATEGORY_NAME: str = "прочее"
DEFAULT_STATUS: str = "active"
DEFAULT_PRIORITY: str = "normal"
