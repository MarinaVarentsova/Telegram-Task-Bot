"""
Обработчики входящих сообщений.

Логика:
  - Текст или голос принимается как задача ТОЛЬКО если пользователь
    предварительно нажал «➕ Создать задачу» (FSM-состояние waiting_for_task).
  - В любом другом случае бот просит нажать кнопку сначала.
"""

import logging
import aiohttp

from aiogram import Router, Bot, F
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from database import get_user_by_telegram_id, get_or_create_user
from keyboards import BTN_CREATE, BTN_BACKLOG, main_keyboard
from services.task_service import process_text_message, process_voice_message
from states import TaskStates

logger = logging.getLogger(__name__)
router = Router()

# Кнопки главной клавиатуры — исключаем из всех текстовых фильтров
_not_button = ~F.text.in_({BTN_CREATE, BTN_BACKLOG})


async def _download_voice(bot: Bot, file_id: str) -> bytes:
    """Скачивает голосовой файл из Telegram и возвращает байты."""
    file = await bot.get_file(file_id)
    url = f"https://api.telegram.org/file/bot{bot.token}/{file.file_path}"
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            if response.status != 200:
                raise Exception(f"Не удалось скачать файл: HTTP {response.status}")
            return await response.read()


async def _get_or_register_user(message: Message) -> dict | None:
    """Получает пользователя из БД, автоматически регистрирует если нужно."""
    user = message.from_user
    if not user:
        return None
    db_user = await get_user_by_telegram_id(user.id)
    if not db_user:
        db_user = await get_or_create_user(
            telegram_id=user.id,
            username=user.username,
            first_name=user.first_name,
        )
        logger.info(f"Автоматически зарегистрирован пользователь {user.id}")
    return db_user


# ─── Текст в режиме ожидания задачи ──────────────────────────────────────────

@router.message(TaskStates.waiting_for_task, F.text & ~F.text.startswith("/") & _not_button)
async def handle_text_task(message: Message, state: FSMContext) -> None:
    """Обрабатывает текст как задачу (пользователь в режиме создания)."""
    user = message.from_user
    if not user or not message.text:
        return

    # Сразу выходим из режима ожидания — следующее сообщение уже не задача
    await state.clear()

    processing_msg = await message.answer("⏳ Обрабатываю задачу...")

    try:
        db_user = await _get_or_register_user(message)
        if not db_user:
            await processing_msg.edit_text("Ошибка идентификации пользователя.")
            return

        await process_text_message(
            user_id=db_user["id"],
            telegram_id=user.id,
            text=message.text,
        )

        await processing_msg.delete()
        await message.answer("✅ Задача создана и добавлена в бэклог.", reply_markup=main_keyboard())

    except Exception as e:
        logger.error(f"Ошибка обработки текста от {user.id}: {e}")
        await processing_msg.edit_text("❌ Не удалось сохранить задачу. Попробуйте позже.")


# ─── Голос в режиме ожидания задачи ──────────────────────────────────────────

@router.message(TaskStates.waiting_for_task, F.voice)
async def handle_voice_task(message: Message, bot: Bot, state: FSMContext) -> None:
    """Транскрибирует голос и создаёт задачу (пользователь в режиме создания)."""
    user = message.from_user
    if not user or not message.voice:
        return

    await state.clear()

    processing_msg = await message.answer("🎤 Распознаю голосовое сообщение...")

    try:
        db_user = await _get_or_register_user(message)
        if not db_user:
            await processing_msg.edit_text("Ошибка идентификации пользователя.")
            return

        await processing_msg.edit_text("🎤 Скачиваю аудио...")
        audio_bytes = await _download_voice(bot, message.voice.file_id)

        await processing_msg.edit_text("🧠 Распознаю речь и создаю задачу...")
        await process_voice_message(
            user_id=db_user["id"],
            audio_bytes=audio_bytes,
            file_format="ogg",
        )

        await processing_msg.delete()
        await message.answer("✅ Задача создана и добавлена в бэклог.", reply_markup=main_keyboard())

    except Exception as e:
        logger.error(f"Ошибка обработки голоса от {user.id}: {e}")
        await processing_msg.edit_text("❌ Не удалось распознать или сохранить задачу. Попробуйте ещё раз.")


# ─── Текст без режима создания задачи ────────────────────────────────────────

@router.message(F.text & ~F.text.startswith("/") & _not_button)
async def handle_text_no_state(message: Message) -> None:
    """Пользователь отправил текст, не нажав кнопку «Создать задачу»."""
    await message.answer(
        "Нажмите ➕ Создать задачу, а потом отправьте текст или голос.",
        reply_markup=main_keyboard(),
    )


# ─── Голос без режима создания задачи ────────────────────────────────────────

@router.message(F.voice)
async def handle_voice_no_state(message: Message) -> None:
    """Пользователь отправил голос, не нажав кнопку «Создать задачу»."""
    await message.answer(
        "Нажмите ➕ Создать задачу, а потом отправьте текст или голос.",
        reply_markup=main_keyboard(),
    )
