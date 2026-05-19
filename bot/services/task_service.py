"""
Сервис управления задачами: создание, форматирование, вывод.
"""

import logging
from datetime import datetime
from typing import Optional
from collections import defaultdict
from database import (
    get_all_categories,
    get_all_columns,
    get_category_by_name,
    get_column_by_name,
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
    """
    lines = []

    lines.append(f"[{number}] {task.get('title', '—')}")

    cat = task.get("tg_categories") or {}
    cat_name = cat.get("name", "—") if isinstance(cat, dict) else "—"
    lines.append(f"Категория: {cat_name}")

    col = task.get("tg_board_columns") or {}
    col_name = col.get("name", "—") if isinstance(col, dict) else "—"
    lines.append(f"Колонка: {col_name}")

    deadline = task.get("deadline")
    if deadline:
        try:
            dt = datetime.fromisoformat(str(deadline).replace("Z", "+00:00"))
            deadline_str = dt.strftime("%d.%m.%Y")
        except Exception:
            deadline_str = str(deadline)
        lines.append(f"Дедлайн: {deadline_str}")
    else:
        lines.append("Дедлайн: не указан")

    description = task.get("description", "")
    if description:
        lines.append(f"Описание: {description}")

    return "\n".join(lines)


def format_task_list(tasks: list[dict]) -> str:
    """
    Форматирует список задач, сгруппированных по колонкам.
    """
    if not tasks:
        return "У вас нет активных задач."

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
    user_id: str,
    telegram_id: int,
    text: str,
) -> dict:
    """
    Обрабатывает текстовое сообщение: извлекает данные задачи и сохраняет.
    """
    logger.info(f"Обработка текста от telegram_id={telegram_id}, user_id={user_id}")
    return await _create_task_from_text(
        user_id=user_id,
        text=text,
        source_text=text,
    )


async def process_voice_message(
    user_id: str,
    audio_bytes: bytes,
    file_format: str = "ogg",
) -> dict:
    """
    Обрабатывает голосовое сообщение: транскрибирует и создаёт задачу.
    """
    transcript = await transcribe_voice(audio_bytes, file_format)
    logger.info(f"Голос транскрибирован: {transcript[:80]}")

    return await _create_task_from_text(
        user_id=user_id,
        text=transcript,
        source_text=transcript,
    )


async def _create_task_from_text(
    user_id: str,
    text: str,
    source_text: str,
) -> dict:
    """
    Внутренний метод: извлекает данные из текста и создаёт задачу в БД.
    """
    today_iso = datetime.now().strftime("%Y-%m-%d")

    # Получаем категории и колонки для контекста AI
    categories = await get_all_categories()
    columns = await get_all_columns()

    # Извлекаем данные задачи через AI
    extracted = await extract_task_data(text, categories, columns, today_iso)
    logger.info(f"Извлечённые данные: {extracted}")

    # ── Определяем категорию ──────────────────────────────────────────────────
    category = None
    cat_name = extracted.get("category") or extracted.get("category_name")
    if cat_name:
        category = await get_category_by_name(cat_name)
    if not category:
        category = await get_default_category()
    if not category and categories:
        category = categories[0]

    # ── Определяем колонку ────────────────────────────────────────────────────
    column = None
    col_name = extracted.get("board_column")
    if col_name:
        column = await get_column_by_name(col_name)
        if column:
            logger.info(f"Колонка из AI: '{col_name}' → id={column['id']}")
        else:
            logger.warning(f"Колонка '{col_name}' не найдена, используем бэклог")
    if not column:
        column = await get_default_column()
    if not column:
        logger.error("Колонка 'бэклог' не найдена в базе данных!")
        raise ValueError("Колонка по умолчанию 'бэклог' не найдена")

    # ── Формируем и сохраняем задачу ─────────────────────────────────────────
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

    task = await create_task(task_data)
    logger.info(
        f"Задача создана: id={task.get('id')} user_id={user_id} "
        f"column='{column.get('name')}' title='{task_data['title'][:50]}'"
    )
    return task
