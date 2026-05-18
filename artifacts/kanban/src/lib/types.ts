export interface Column {
  id: string;
  name: string;
  sort_order: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  user_id: string;
  "исходный текст": string | null;
  "описание": string | null;
  title?: string;
  description?: string;
  deadline: string | null;
  board_column_id: string;
  category_id: string | null;
  "статус": string | null;
  "приоритет": string | null;
  created_at: string;
}

export interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  timezone: string | null;
}
