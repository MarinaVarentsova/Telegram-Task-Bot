"""
Клиент Supabase и все запросы к базе данных.
Использует прямые HTTP-запросы к Supabase REST API через httpx.
Работает с существующими таблицами: tg_users, tg_tasks, tg_categories, tg_board_columns.
"""

import logging
import os
import httpx
from typing import Optional

logger = logging.getLogger(__name__)


def _get_headers() -> dict:
    """Возвращает заголовки авторизации для Supabase REST API."""
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _base_url() -> str:
    """Возвращает базовый URL Supabase REST API."""
    url = os.environ["SUPABASE_URL"].rstrip("/")
    return f"{url}/rest/v1"


# ─── Пользователи ─────────────────────────────────────────────────────────────

async def get_or_create_user(
    telegram_id: int,
    username: Optional[str],
    first_name: Optional[str],
    last_name: Optional[str],
) -> dict:
    """
    Получает пользователя по telegram_id или создаёт нового.
    Возвращает запись из tg_users.
    """
    existing = await get_user_by_telegram_id(telegram_id)
    if existing:
        return existing

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_base_url()}/tg_users",
            headers=_get_headers(),
            json={
                "telegram_id": telegram_id,
                "username": username,
                "first_name": first_name,
                "last_name": last_name,
            },
        )
        response.raise_for_status()
        data = response.json()
        if not data:
            raise Exception("Пустой ответ при создании пользователя")
        logger.info(f"Создан новый пользователь: telegram_id={telegram_id}")
        return data[0]


async def get_user_by_telegram_id(telegram_id: int) -> Optional[dict]:
    """Получает пользователя по telegram_id."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_base_url()}/tg_users",
            headers=_get_headers(),
            params={
                "telegram_id": f"eq.{telegram_id}",
                "limit": "1",
            },
        )
        response.raise_for_status()
        data = response.json()
        return data[0] if data else None


# ─── Категории ────────────────────────────────────────────────────────────────

async def get_all_categories() -> list[dict]:
    """Получает все категории из tg_categories."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_base_url()}/tg_categories",
            headers=_get_headers(),
        )
        response.raise_for_status()
        return response.json() or []


async def get_category_by_name(name: str) -> Optional[dict]:
    """Ищет категорию по имени (без учёта регистра)."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_base_url()}/tg_categories",
            headers=_get_headers(),
            params={
                "name": f"ilike.{name}",
                "limit": "1",
            },
        )
        response.raise_for_status()
        data = response.json()
        return data[0] if data else None


async def get_default_category() -> Optional[dict]:
    """Получает категорию 'прочее' как запасную."""
    return await get_category_by_name("прочее")


# ─── Колонки доски ────────────────────────────────────────────────────────────

async def get_all_columns() -> list[dict]:
    """Получает все колонки из tg_board_columns."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_base_url()}/tg_board_columns",
            headers=_get_headers(),
        )
        response.raise_for_status()
        return response.json() or []


async def get_column_by_name(name: str) -> Optional[dict]:
    """Ищет колонку по имени (без учёта регистра)."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_base_url()}/tg_board_columns",
            headers=_get_headers(),
            params={
                "name": f"ilike.{name}",
                "limit": "1",
            },
        )
        response.raise_for_status()
        data = response.json()
        return data[0] if data else None


async def get_default_column() -> Optional[dict]:
    """Получает колонку 'бэклог' как запасную."""
    return await get_column_by_name("бэклог")


# ─── Задачи ───────────────────────────────────────────────────────────────────

async def create_task(task_data: dict) -> dict:
    """
    Создаёт новую задачу в tg_tasks.
    Обязательные поля: title, description, user_id, category_id, board_column_id.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_base_url()}/tg_tasks",
            headers=_get_headers(),
            json=task_data,
        )
        response.raise_for_status()
        data = response.json()
        if not data:
            raise Exception("Пустой ответ при создании задачи")
        logger.info(f"Создана задача: {task_data.get('title', '')[:50]}")
        return data[0]


async def get_active_tasks_by_user(user_id: int) -> list[dict]:
    """
    Получает активные задачи пользователя с данными категории и колонки.
    """
    # Сначала получаем задачи
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_base_url()}/tg_tasks",
            headers={**_get_headers(), "Prefer": ""},
            params={
                "user_id": f"eq.{user_id}",
                "status": "eq.active",
                "order": "created_at.asc",
                "select": "*, tg_categories(name), tg_board_columns(name)",
            },
        )
        response.raise_for_status()
        return response.json() or []


async def get_tasks_by_column(user_id: int, column_name: str) -> list[dict]:
    """Получает задачи пользователя из конкретной колонки."""
    column = await get_column_by_name(column_name)
    if not column:
        return []

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_base_url()}/tg_tasks",
            headers={**_get_headers(), "Prefer": ""},
            params={
                "user_id": f"eq.{user_id}",
                "board_column_id": f"eq.{column['id']}",
                "status": "eq.active",
                "order": "created_at.asc",
                "select": "*, tg_categories(name), tg_board_columns(name)",
            },
        )
        response.raise_for_status()
        return response.json() or []


async def get_task_by_number(user_id: int, task_number: int) -> Optional[dict]:
    """
    Получает задачу пользователя по порядковому номеру (1-based)
    среди его активных задач, отсортированных по дате создания.
    """
    tasks = await get_active_tasks_by_user(user_id)
    if 1 <= task_number <= len(tasks):
        return tasks[task_number - 1]
    return None


async def move_task_to_column(task_id: int, column_id: int) -> bool:
    """Перемещает задачу в другую колонку."""
    async with httpx.AsyncClient() as client:
        response = await client.patch(
            f"{_base_url()}/tg_tasks",
            headers={**_get_headers(), "Prefer": ""},
            params={"id": f"eq.{task_id}"},
            json={"board_column_id": column_id},
        )
        response.raise_for_status()
        logger.info(f"Задача {task_id} перемещена в колонку {column_id}")
        return True


async def change_task_category(task_id: int, category_id: int) -> bool:
    """Меняет категорию задачи."""
    async with httpx.AsyncClient() as client:
        response = await client.patch(
            f"{_base_url()}/tg_tasks",
            headers={**_get_headers(), "Prefer": ""},
            params={"id": f"eq.{task_id}"},
            json={"category_id": category_id},
        )
        response.raise_for_status()
        logger.info(f"Категория задачи {task_id} изменена на {category_id}")
        return True


async def mark_task_done(task_id: int, done_column_id: int) -> bool:
    """Перемещает задачу в колонку 'выполнено'."""
    return await move_task_to_column(task_id, done_column_id)
