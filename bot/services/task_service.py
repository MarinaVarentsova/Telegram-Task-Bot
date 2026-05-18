"""
Сервис управления задачами: создание, форматирование, вывод.
"""

import logging
from typing import Optional
from collections import defaultdict
from database import (
    get_all_categories,
    get_category_by_name,
    get_default_category,
    get_default_column,
    create_task,
    get_active_tasks_by_user,
    get_tasks_by_column,
)
from services.ai_service import extract_task_data, transcribe_voice
from config import DEFAULT_STATUS, DEFAULT_PRIORITY

logger = logging.getLogger(__name__)


def format_task(task: dict, number: int) -> str:
    """
    Форматирует задачу для отображения пользователю.

    Формат:
    [N] Название
    Категория: ...
    Колонка: ...
    Дедлайн: ...
    Описание: ...
    """
    lines = []

    # Заголовок
    lines.append(f"[{number}] {task.get('title', '—')}")

    # Категория
    cat = task.get("tg_categories") or {}
    cat_name = cat.get("name", "—") if isinstance(cat, dict) else "—"
    lines.append(f"Категория: {cat_name}")

    # Колонка
    col = task.get("tg_board_columns") or {}
    col_name = col.get("name", "—") if isinstance(col, dict) else "—"
    lines.append(f"Колонка: {col_name}")

    # Дедлайн
    deadline = task.get("deadline")
    if deadline:
        # Форматируем дату из ISO 8601
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(str(deadline).replace("Z", "+00:00"))
            deadline_str = dt.strftime("%d.%m.%Y %H:%M")
        except Exception:
            deadline_str = str(deadline)
        lines.append(f"Дедлайн: {deadline_str}")
    else:
        lines.append("Дедлайн: не указан")

    # Описание
    description = task.get("description", "")
    if description:
        lines.append(f"Описание: {description}")

    return "\n".join(lines)


def format_task_list(tasks: list[dict]) -> str:
    """
    Форматирует список задач, сгруппированных по колонкам.
    Возвращает готовый текст для отправки.
    """
    if not tasks:
        return "У вас нет активных задач."

    # Группируем по колонке
    groups: dict[str, list] = defaultdict(list)
    for task in tasks:
        col = task.get("tg_board_columns") or {}
        col_name = col.get("name", "Без колонки") if isinstance(col, dict) else "Без колонки"
        groups[col_name].append(task)

    lines = []
    task_number = 1

    for col_name, col_tasks in groups.items():
        lines.append(f"\n📋 {col_name.upper()}")
        lines.append("─" * 30)
        for task in col_tasks:
            lines.append(format_task(task, task_number))
            lines.append("")
            task_number += 1

    return "\n".join(lines).strip()


async def process_text_message(
    user_id: int,
    telegram_id: int,
    text: str,
) -> dict:
    """
    Обрабатывает текстовое сообщение: извлекает данные задачи и сохраняет.

    Returns:
        Созданная задача
    """
    return await _create_task_from_text(
        user_id=user_id,
        text=text,
        source_text=text,
    )


async def process_voice_message(
    user_id: int,
    audio_bytes: bytes,
    file_format: str = "ogg",
) -> dict:
    """
    Обрабатывает голосовое сообщение: транскрибирует и создаёт задачу.

    Returns:
        Созданная задача
    """
    # Транскрипция голоса
    transcript = await transcribe_voice(audio_bytes, file_format)
    logger.info(f"Голос транскрибирован: {transcript[:80]}")

    return await _create_task_from_text(
        user_id=user_id,
        text=transcript,
        source_text=transcript,
    )


async def _create_task_from_text(
    user_id: int,
    text: str,
    source_text: str,
) -> dict:
    """
    Внутренний метод: извлекает данные из текста и создаёт задачу в БД.
    """
    # Получаем категории для контекста AI
    categories = await get_all_categories()

    # Извлекаем данные задачи через AI
    extracted = await extract_task_data(text, categories)

    # Определяем категорию
    category = None
    if extracted.get("category_name"):
        category = await get_category_by_name(extracted["category_name"])
    if not category:
        category = await get_default_category()
    if not category and categories:
        category = categories[0]

    # Определяем колонку (всегда бэклог по умолчанию)
    column = await get_default_column()
    if not column:
        logger.error("Колонка 'бэклог' не найдена в базе данных!")
        raise ValueError("Колонка по умолчанию 'бэклог' не найдена")

    # Формируем данные задачи
    task_data = {
        "title": extracted.get("title", text[:80]),
        "description": extracted.get("description", text),
        "source_text": source_text,
        "user_id": user_id,
        "category_id": category["id"] if category else None,
        "board_column_id": column["id"],
        "deadline": extracted.get("deadline"),
        "reminder_sent": False,
        "status": DEFAULT_STATUS,
        "priority": DEFAULT_PRIORITY,
    }

    # Сохраняем задачу
    task = await create_task(task_data)
    return task
