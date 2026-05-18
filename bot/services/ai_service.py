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
) -> dict:
    """
    Извлекает данные задачи из произвольного текста пользователя.

    Args:
        text: Исходный текст (или транскрипция голосового сообщения)
        categories: Список доступных категорий [{"id": ..., "name": ...}, ...]

    Returns:
        Словарь с полями: title, description, deadline, category_name
    """
    client = _get_client()
    category_names = [c["name"] for c in categories] if categories else []
    categories_str = ", ".join(category_names) if category_names else "прочее"

    system_prompt = f"""Ты помощник по управлению задачами. Извлеки структурированные данные задачи из текста.

Доступные категории: {categories_str}

Правила:
- title: краткое название задачи на русском языке, максимум 80 символов
- description: полное структурированное описание задачи на русском языке
- deadline: дедлайн в формате ISO 8601 (YYYY-MM-DDTHH:MM:SS) если упомянут, иначе null
- category_name: выбери наиболее подходящую категорию из списка или "прочее"

Отвечай ТОЛЬКО валидным JSON без markdown-обёртки:
{{"title": "...", "description": "...", "deadline": null, "category_name": "..."}}"""

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
        logger.info(f"Извлечена задача: title='{data.get('title', '')[:50]}'")
        return data
    except json.JSONDecodeError:
        logger.error(f"Ошибка парсинга JSON: {content[:200]}")
        # Запасной вариант
        return {
            "title": text[:80],
            "description": text,
            "deadline": None,
            "category_name": "прочее",
        }
