# Telegram Task Management Bot

Telegram-бот для управления задачами с поддержкой голосовых сообщений и AI-обработкой текста.

## Run & Operate

- `cd bot && python3 main.py` — запуск бота (polling mode)
- Workflow **"Telegram Bot"** — автоматически запускает бота

## Stack

- Python 3.11
- aiogram 3 — фреймворк для Telegram-ботов
- Supabase — PostgreSQL база данных (REST API через httpx)
- OpenAI (Replit AI) — транскрипция голоса и извлечение задач из текста

## Where things live

- `bot/main.py` — точка входа, запуск polling
- `bot/config.py` — конфигурация из переменных окружения
- `bot/database.py` — все запросы к Supabase REST API
- `bot/handlers/commands.py` — обработчики команд (/start, /tasks, /today и т.д.)
- `bot/handlers/messages.py` — обработчик текстовых и голосовых сообщений
- `bot/services/ai_service.py` — транскрипция и извлечение данных задачи через AI
- `bot/services/task_service.py` — бизнес-логика создания задач

## Architecture decisions

- Supabase REST API напрямую через `httpx` (избегает проблем с JWT-валидацией в supabase-py)
- AI-клиент создаётся лениво при каждом вызове (lazy init) — env vars читаются в runtime
- Номера задач в командах (/done, /move, /tag) — порядковые номера из списка активных задач
- Голосовые сообщения транскрибируются через `gpt-4o-mini-transcribe`, данные извлекаются через `gpt-5-mini`
- Всё в polling mode (MVP), без вебхуков

## Product

- Пользователь отправляет текст или голос → бот создаёт задачу в Supabase
- AI автоматически извлекает: заголовок, описание, дедлайн, категорию
- Задачи организованы по колонкам Kanban-доски (бэклог, сегодня, выполнено и др.)
- Команды для управления: просмотр, перемещение, смена категории, отметка выполненной

## User preferences

- Все тексты и интерфейс на русском языке
- Архитектура простая, без фронтенда — только backend polling bot

## Gotchas

- Supabase REST API фильтры: `ilike.{name}` для поиска без учёта регистра
- Replit AI env vars (`AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`) устанавливаются автоматически через интеграцию
- При добавлении новых секретов — перезапустить workflow "Telegram Bot"
- Голосовые сообщения Telegram приходят в формате OGG/Opus

## Required env vars / secrets

- `TELEGRAM_BOT_TOKEN` — токен от @BotFather
- `SUPABASE_URL` — URL Supabase проекта
- `SUPABASE_SERVICE_ROLE_KEY` — service role ключ
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Replit AI (авто)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit AI (авто)

## Pointers

- `bot/README.md` — документация на русском языке
- `bot/.env.example` — пример переменных окружения для локальной разработки
