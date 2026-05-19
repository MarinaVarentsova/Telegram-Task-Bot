"""
FSM-состояния бота.
Импортируется как в commands.py, так и в messages.py.
"""

from aiogram.fsm.state import State, StatesGroup


class TaskStates(StatesGroup):
    waiting_for_task = State()
