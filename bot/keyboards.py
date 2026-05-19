"""
Общие клавиатуры и константы кнопок бота.
"""

from aiogram.types import (
    ReplyKeyboardMarkup,
    KeyboardButton,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)

# Тексты кнопок — используются для сравнения входящих сообщений
BTN_CREATE  = "➕ Создать задачу"
BTN_BACKLOG = "📋 Бэклог задач"


def main_keyboard() -> ReplyKeyboardMarkup:
    """Основная постоянная клавиатура с двумя кнопками."""
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=BTN_CREATE), KeyboardButton(text=BTN_BACKLOG)]],
        resize_keyboard=True,
        is_persistent=True,
    )


def backlog_inline_button(url: str) -> InlineKeyboardMarkup:
    """Инлайн-кнопка для открытия бэклога по URL."""
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="📋 Открыть доску", url=url)]]
    )
