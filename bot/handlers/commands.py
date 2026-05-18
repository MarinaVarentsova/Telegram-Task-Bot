"""
Обработчики команд и кнопок бота.
"""

import logging
from aiogram import Router, F
from aiogram.filters import Command, CommandObject
from aiogram.types import Message
from config import APP_URL
from database import (
    get_or_create_user,
    get_user_by_telegram_id,
    get_column_by_name,
    get_category_by_name,
    get_task_by_number,
    mark_task_done,
    move_task_to_column,
    change_task_category,
)
from keyboards import BTN_CREATE, BTN_BACKLOG, main_keyboard, backlog_inline_button

logger = logging.getLogger(__name__)
router = Router()


# ─── /start ───────────────────────────────────────────────────────────────────

@router.message(Command("start"))
async def cmd_start(message: Message) -> None:
    """Регистрирует пользователя и показывает главную клавиатуру."""
    user = message.from_user
    if not user:
        return

    try:
        await get_or_create_user(
            telegram_id=user.id,
            username=user.username,
            first_name=user.first_name,
        )
        await message.answer(
            "Я помогу быстро записывать задачи. "
            "Создайте задачу голосом или текстом, а бэклог смотрите на доске.",
            reply_markup=main_keyboard(),
        )
    except Exception as e:
        logger.error(f"Ошибка в /start для {user.id}: {e}")
        await message.answer("Произошла ошибка при регистрации. Попробуйте позже.")


# ─── Кнопка «Создать задачу» ─────────────────────────────────────────────────

@router.message(F.text == BTN_CREATE)
async def btn_create_task(message: Message) -> None:
    """Подсказывает пользователю отправить текст или голос."""
    await message.answer(
        "Отправьте задачу текстом или голосовым сообщением — я сохраню её в бэклог."
    )


# ─── Кнопка «Просмотреть бэклог» ─────────────────────────────────────────────

@router.message(F.text == BTN_BACKLOG)
async def btn_view_backlog(message: Message) -> None:
    """Открывает ссылку на бэклог или сообщает что она не настроена."""
    if APP_URL:
        await message.answer(
            "Открыть бэклог:",
            reply_markup=backlog_inline_button(APP_URL),
        )
    else:
        await message.answer("Ссылка на бэклог пока не настроена.")


# ─── /tasks и /today — редирект на доску ─────────────────────────────────────

@router.message(Command("tasks"))
async def cmd_tasks(message: Message) -> None:
    if APP_URL:
        await message.answer(
            "Бэклог удобнее смотреть на доске.",
            reply_markup=backlog_inline_button(APP_URL),
        )
    else:
        await message.answer(
            "Бэклог удобнее смотреть на доске.",
            reply_markup=main_keyboard(),
        )


@router.message(Command("today"))
async def cmd_today(message: Message) -> None:
    if APP_URL:
        await message.answer(
            "Бэклог удобнее смотреть на доске.",
            reply_markup=backlog_inline_button(APP_URL),
        )
    else:
        await message.answer(
            "Бэклог удобнее смотреть на доске.",
            reply_markup=main_keyboard(),
        )


# ─── /done ────────────────────────────────────────────────────────────────────

@router.message(Command("done"))
async def cmd_done(message: Message, command: CommandObject) -> None:
    """Отмечает задачу выполненной: /done [номер]"""
    user = message.from_user
    if not user:
        return

    if not command.args:
        await message.answer("Использование: /done [номер задачи]\nПример: /done 3")
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
            await message.answer(
                f"✅ Задача #{task_number} отмечена как выполненная!\n\n{task.get('title', '')}",
                reply_markup=main_keyboard(),
            )
        else:
            await message.answer("Не удалось обновить задачу. Попробуйте позже.")
    except Exception as e:
        logger.error(f"Ошибка в /done для {user.id}: {e}")
        await message.answer("Ошибка при обновлении задачи. Попробуйте позже.")


# ─── /move ────────────────────────────────────────────────────────────────────

@router.message(Command("move"))
async def cmd_move(message: Message, command: CommandObject) -> None:
    """Перемещает задачу в колонку: /move [номер] [колонка]"""
    user = message.from_user
    if not user:
        return

    if not command.args:
        await message.answer(
            "Использование: /move [номер задачи] [название колонки]\n"
            "Пример: /move 2 сегодня"
        )
        return

    parts = command.args.strip().split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Укажите номер задачи и название колонки.\nПример: /move 2 сегодня")
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
            await message.answer(f"Колонка '{column_name}' не найдена.")
            return

        success = await move_task_to_column(task["id"], column["id"])
        if success:
            await message.answer(
                f"✅ Задача #{task_number} перемещена в '{column['name']}'.\n\n{task.get('title', '')}",
                reply_markup=main_keyboard(),
            )
        else:
            await message.answer("Не удалось переместить задачу. Попробуйте позже.")
    except Exception as e:
        logger.error(f"Ошибка в /move для {user.id}: {e}")
        await message.answer("Ошибка при перемещении задачи. Попробуйте позже.")


# ─── /tag ─────────────────────────────────────────────────────────────────────

@router.message(Command("tag"))
async def cmd_tag(message: Message, command: CommandObject) -> None:
    """Меняет категорию задачи: /tag [номер] [категория]"""
    user = message.from_user
    if not user:
        return

    if not command.args:
        await message.answer(
            "Использование: /tag [номер задачи] [название категории]\n"
            "Пример: /tag 1 работа"
        )
        return

    parts = command.args.strip().split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Укажите номер задачи и название категории.\nПример: /tag 1 работа")
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
            await message.answer(f"Категория '{category_name}' не найдена.")
            return

        success = await change_task_category(task["id"], category["id"])
        if success:
            await message.answer(
                f"✅ Категория задачи #{task_number} изменена на '{category['name']}'.\n\n{task.get('title', '')}",
                reply_markup=main_keyboard(),
            )
        else:
            await message.answer("Не удалось изменить категорию. Попробуйте позже.")
    except Exception as e:
        logger.error(f"Ошибка в /tag для {user.id}: {e}")
        await message.answer("Ошибка при изменении категории. Попробуйте позже.")
