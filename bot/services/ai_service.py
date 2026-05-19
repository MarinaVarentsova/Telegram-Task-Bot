"""
AI-сервис для:
1. Транскрипции голосовых сообщений (Whisper через Replit AI)
2. Извлечения данных задачи из текста (GPT через Replit AI)
"""

import io
import json
import logging
import os
import re
from typing import Optional
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


def _get_client() -> AsyncOpenAI:
    """Создаёт клиент OpenAI с Replit AI прокси (lazy initialization)."""
    return AsyncOpenAI(
        base_url=os.environ["AI_INTEGRATIONS_OPENAI_BASE_URL"],
        api_key=os.environ["AI_INTEGRATIONS_OPENAI_API_KEY"],
    )


async def transcribe_voice(audio_bytes: bytes, file_format: str = "ogg") -> str:
    """
    Транскрибирует голосовое сообщение в текст.

    Args:
        audio_bytes: Байты аудиофайла
        file_format: Формат файла (ogg, mp3, wav и т.д.)

    Returns:
        Распознанный текст
    """
    client = _get_client()
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = f"voice.{file_format}"

    response = await client.audio.transcriptions.create(
        model="gpt-4o-mini-transcribe",
        file=audio_file,
        response_format="json",
        language="ru",
    )
    transcript = response.text.strip()
    logger.info(f"Транскрипция выполнена: {transcript[:80]}")
    return transcript


async def extract_task_data(
    text: str,
    categories: list[dict],
    columns: list[dict],
    today_iso: str,
) -> dict:
    """
    Извлекает данные задачи из произвольного текста пользователя.

    Args:
        text: Исходный текст (или транскрипция голосового сообщения)
        categories: Список доступных категорий [{"id": ..., "name": ...}, ...]
        columns: Список доступных колонок [{"id": ..., "name": ...}, ...]
        today_iso: Сегодняшняя дата в формате YYYY-MM-DD

    Returns:
        Словарь с полями: title, description, deadline, board_column, category
    """
    client = _get_client()

    category_names = [c["name"] for c in categories] if categories else ["прочее"]
    column_names = [c["name"] for c in columns] if columns else ["бэклог"]
    categories_str = ", ".join(category_names)
    columns_str = ", ".join(column_names)

    system_prompt = f"""Ты помощник по управлению задачами. Извлеки структурированные данные задачи из текста пользователя.

Сегодняшняя дата: {today_iso}
Доступные категории: {categories_str}
Доступные колонки доски: {columns_str}

Правила извлечения:

ЗАГОЛОВОК (title):
- Краткое описание задачи, максимум 80 символов
- Убери из заголовка командные слова: "поставь мне задачу", "создай задачу", "добавь задачу", "запиши задачу"
- Убери из заголовка метаданные: упоминания дат, колонок, тегов/категорий
- Только суть самой задачи

ОПИСАНИЕ (description):
- Полный контекст задачи, сохрани все подробности из слов пользователя
- Можно включить подробности, убранные из заголовка

ДЕДЛАЙН (deadline):
- Если упомянута конкретная дата → дедлайн в формате YYYY-MM-DD (только дата, без времени)
- Используй текущий год: {today_iso[:4]}
- Если дата уже прошла в текущем году → используй следующий год
- "сегодня" как ДАТА (не как колонка) → {today_iso}
- "завтра" как дата → следующий день после {today_iso}
- Если пользователь сказал "без даты" → null
- Если дата вообще не упомянута → null
- Примеры: "28 мая" → "{today_iso[:4]}-05-28", "1 июня" → "{today_iso[:4]}-06-01"

КОЛОНКА (board_column) — выбери ОДНУ из: {columns_str}
- "на сегодня", "задача на сегодня" → "сегодня"
- "в бэклог", "в backlog", не упомянуто → "бэклог"
- "на неделе", "на этой неделе" → "на неделе"
- "в выполнено" → "выполнено"
- Сопоставляй без учёта регистра
- Если колонка не упомянута → "бэклог"

КАТЕГОРИЯ (category) — выбери ОДНУ из: {categories_str}
- "с тегом X", "категория X", "тег X" → название категории X
- Сопоставляй без учёта регистра
- Если категория не упомянута → "прочее"

Отвечай ТОЛЬКО валидным JSON без markdown-обёртки:
{{"title": "...", "description": "...", "deadline": null, "board_column": "...", "category": "..."}}"""

    response = await client.chat.completions.create(
        model="gpt-5-mini",
        max_completion_tokens=1024,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Текст задачи:\n{text}"},
        ],
    )
    content = response.choices[0].message.content.strip()

    # Убираем возможную markdown-обёртку
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)

    try:
        data = json.loads(content)
        logger.info(
            f"Извлечена задача: title='{data.get('title', '')[:50]}' "
            f"column='{data.get('board_column', '')}' "
            f"category='{data.get('category', '')}' "
            f"deadline='{data.get('deadline')}'"
        )
        return data
    except json.JSONDecodeError:
        logger.error(f"Ошибка парсинга JSON от AI: {content[:200]}")
        return {
            "title": text[:80],
            "description": text,
            "deadline": None,
            "board_column": "бэклог",
            "category": "прочее",
        }
