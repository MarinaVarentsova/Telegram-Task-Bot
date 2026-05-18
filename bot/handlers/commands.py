"""
Обработчики команд бота:
/start, /tasks, /today, /done, /categories, /columns, /move, /tag
"""

import logging
from aiogram import Router
from aiogram.filters import Command, CommandObject
from aiogram.types import Message
from database import (
    get_or_create_user,
    get_user_by_telegram_id,
    get_all_categories,
    get_all_columns,
    get_column_by_name,
    get_category_by_name,
    get_active_tasks_by_user,
    get_tasks_by_column,
    get_task_by_number,
    mark_task_done,
    move_task_to_column,
    change_task_category,
)
from services.task_service import format_task_list, format_task

logger = logging.getLogger(__name__)
router = Router()


# ─── /start ───────────────────────────────────────────────────────────────────

@router.message(Command("start"))
async def cmd_start(message: Message) -> None:
    """Регистрирует пользователя и приветствует его."""
    user = message.from_user
    if not user:
        return

    try:
        db_user = await get_or_create_user(
            telegram_id=user.id,
            username=user.username,
            first_name=user.first_name,
            last_name=user.last_name,
        )
        name = user.first_name or user.username or "пользователь"
        await message.answer(
            f"👋 Привет, {name}!\n\n"
            "Я бот для управления задачами. Просто напишите мне задачу текстом "
            "или отправьте голосовое сообщение — я всё запишу.\n\n"
            "📋 Команды:\n"
            "/tasks — все активные задачи\n"
            "/today — задачи на сегодня\n"
            "/done <номер> — отметить задачу выполненной\n"
            "/move <номер> <колонка> — переместить задачу\n"
            "/tag <номер> <категория> — изменить категорию\n"
            "/categories — список категорий\n"
            "/columns — список колонок"
        )
    except Exception as e:
        logger.error(f"Ошибка в /start для {user.id}: {e}")
        await message.answer("Произошла ошибка при регистрации. Попробуйте позже.")


# ─── /tasks ───────────────────────────────────────────────────────────────────

@router.message(Command("tasks"))
async def cmd_tasks(message: Message) -> None:
    """Показывает все активные задачи, сгруппированные по колонкам."""
    user = message.from_user
    if not user:
        return

    try:
        db_user = await get_user_by_telegram_id(user.id)
        if not db_user:
            await message.answer("Сначала используйте /start для регистрации.")
            return

        tasks = await get_active_tasks_by_user(db_user["id"])
        text = format_task_list(tasks)
        await message.answer(text)
    except Exception as e:
        logger.error(f"Ошибка в /tasks для {user.id}: {e}")
        await message.answer("Ошибка при получении задач. Попробуйте позже.")


# ─── /today ───────────────────────────────────────────────────────────────────

@router.message(Command("today"))
async def cmd_today(message: Message) -> None:
    """Показывает задачи из колонки 'сегодня'."""
    user = message.from_user
    if not user:
        return

    try:
        db_user = await get_user_by_telegram_id(user.id)
        if not db_user:
            await message.answer("Сначала используйте /start для регистрации.")
            return

        tasks = await get_tasks_by_column(db_user["id"], "сегодня")
        if not tasks:
            await message.answer("На сегодня задач нет.")
            return

        lines = ["📅 Задачи на сегодня:\n"]
        for i, task in enumerate(tasks, start=1):
            lines.append(format_task(task, i))
            lines.append("")
        await message.answer("\n".join(lines).strip())
    except Exception as e:
        logger.error(f"Ошибка в /today для {user.id}: {e}")
        await message.answer("Ошибка при получении задач. Попробуйте позже.")


# ─── /done ────────────────────────────────────────────────────────────────────

@router.message(Command("done"))
async def cmd_done(message: Message, command: CommandObject) -> None:
    """
    Отмечает задачу как выполненную: /done <номер_задачи>
    Перемещает задачу в колонку 'выполнено'.
    """
    user = message.from_user
    if not user:
        return

    if not command.args:
        await message.answer("Использование: /done <номер задачи>\nПример: /done 3")
        return

    try:
        task_number = int(command.args.strip())
    except ValueError:
        await message.answer("Номер задачи должен быть числом. Пример: /done 3")
        return

    try:
        db_user = await get_user_by_telegram_id(user.id)
        if not db_user:
            await message.answer("Сначала используйте /start для регистрации.")
            return

        task = await get_task_by_number(db_user["id"], task_number)
        if not task:
            await message.answer(f"Задача #{task_number} не найдена.")
            return

        done_column = await get_column_by_name("выполнено")
        if not done_column:
            await message.answer("Колонка 'выполнено' не найдена в системе.")
            return

        success = await mark_task_done(task["id"], done_column["id"])
        if success:
            await message.answer(f"✅ Задача #{task_number} отмечена как выполненная!\n\n{task.get('title', '')}")
        else:
            await message.answer("Не удалось обновить задачу. Попробуйте позже.")
    except Exception as e:
        logger.error(f"Ошибка в /done для {user.id}: {e}")
        await message.answer("Ошибка при обновлении задачи. Попробуйте позже.")


# ─── /categories ──────────────────────────────────────────────────────────────

@router.message(Command("categories"))
async def cmd_categories(message: Message) -> None:
    """Показывает список доступных категорий."""
    try:
        categories = await get_all_categories()
        if not categories:
            await message.answer("Категории не найдены.")
            return

        lines = ["📂 Доступные категории:\n"]
        for cat in categories:
            lines.append(f"• {cat.get('name', '—')}")
        await message.answer("\n".join(lines))
    except Exception as e:
        logger.error(f"Ошибка в /categories: {e}")
        await message.answer("Ошибка при получении категорий.")


# ─── /columns ─────────────────────────────────────────────────────────────────

@router.message(Command("columns"))
async def cmd_columns(message: Message) -> None:
    """Показывает список колонок доски."""
    try:
        columns = await get_all_columns()
        if not columns:
            await message.answer("Колонки не найдены.")
            return

        lines = ["📋 Колонки доски:\n"]
        for col in columns:
            lines.append(f"• {col.get('name', '—')}")
        await message.answer("\n".join(lines))
    except Exception as e:
        logger.error(f"Ошибка в /columns: {e}")
        await message.answer("Ошибка при получении колонок.")


# ─── /move ────────────────────────────────────────────────────────────────────

@router.message(Command("move"))
async def cmd_move(message: Message, command: CommandObject) -> None:
    """
    Перемещает задачу в другую колонку: /move <номер> <название_колонки>
    Пример: /move 2 сегодня
    """
    user = message.from_user
    if not user:
        return

    if not command.args:
        await message.answer(
            "Использование: /move <номер задачи> <название колонки>\n"
            "Пример: /move 2 сегодня"
        )
        return

    parts = command.args.strip().split(maxsplit=1)
    if len(parts) < 2:
        await message.answer(
            "Укажите номер задачи и название колонки.\n"
            "Пример: /move 2 сегодня"
        )
        return

    try:
        task_number = int(parts[0])
    except ValueError:
        await message.answer("Первый аргумент должен быть номером задачи.")
        return

    column_name = parts[1].strip()

    try:
        db_user = await get_user_by_telegram_id(user.id)
        if not db_user:
            await message.answer("Сначала используйте /start для регистрации.")
            return

        task = await get_task_by_number(db_user["id"], task_number)
        if not task:
            await message.answer(f"Задача #{task_number} не найдена.")
            return

        column = await get_column_by_name(column_name)
        if not column:
            await message.answer(f"Колонка '{column_name}' не найдена.\nИспользуйте /columns для просмотра доступных колонок.")
            return

        success = await move_task_to_column(task["id"], column["id"])
        if success:
            await message.answer(
                f"✅ Задача #{task_number} перемещена в колонку '{column['name']}'.\n\n{task.get('title', '')}"
            )
        else:
            await message.answer("Не удалось переместить задачу. Попробуйте позже.")
    except Exception as e:
        logger.error(f"Ошибка в /move для {user.id}: {e}")
        await message.answer("Ошибка при перемещении задачи. Попробуйте позже.")


# ─── /tag ─────────────────────────────────────────────────────────────────────

@router.message(Command("tag"))
async def cmd_tag(message: Message, command: CommandObject) -> None:
    """
    Меняет категорию задачи: /tag <номер> <название_категории>
    Пример: /tag 1 работа
    """
    user = message.from_user
    if not user:
        return

    if not command.args:
        await message.answer(
            "Использование: /tag <номер задачи> <название категории>\n"
            "Пример: /tag 1 работа"
        )
        return

    parts = command.args.strip().split(maxsplit=1)
    if len(parts) < 2:
        await message.answer(
            "Укажите номер задачи и название категории.\n"
            "Пример: /tag 1 работа"
        )
        return

    try:
        task_number = int(parts[0])
    except ValueError:
        await message.answer("Первый аргумент должен быть номером задачи.")
        return

    category_name = parts[1].strip()

    try:
        db_user = await get_user_by_telegram_id(user.id)
        if not db_user:
            await message.answer("Сначала используйте /start для регистрации.")
            return

        task = await get_task_by_number(db_user["id"], task_number)
        if not task:
            await message.answer(f"Задача #{task_number} не найдена.")
            return

        category = await get_category_by_name(category_name)
        if not category:
            await message.answer(
                f"Категория '{category_name}' не найдена.\n"
                "Используйте /categories для просмотра доступных категорий."
            )
            return

        success = await change_task_category(task["id"], category["id"])
        if success:
            await message.answer(
                f"✅ Категория задачи #{task_number} изменена на '{category['name']}'.\n\n{task.get('title', '')}"
            )
        else:
            await message.answer("Не удалось изменить категорию. Попробуйте позже.")
    except Exception as e:
        logger.error(f"Ошибка в /tag для {user.id}: {e}")
        await message.answer("Ошибка при изменении категории. Попробуйте позже.")
