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
  title: string;
  description: string | null;
  deadline: string | null;
  column_id: string;
  category_id: string | null;
  created_at: string;
}

export interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  timezone: string | null;
}
