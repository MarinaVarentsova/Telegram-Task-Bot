/**
 * Thin API client that talks to the Express API server (/api/kanban/*)
 * instead of hitting Supabase directly from the browser.
 *
 * Supabase's sb_secret_* keys are blocked in browsers, so all data access
 * is proxied through the backend.
 *
 * Task fetching requires a tg_id (Telegram integer user ID) query param.
 * The backend resolves:  telegram_id → tg_users.id (UUID) → tg_tasks.user_id
 */

const BASE = "/api/kanban";

/** Typed error thrown when the user is not found in tg_users. */
export class UserNotFoundError extends Error {
  constructor() {
    super("user_not_found");
    this.name = "UserNotFoundError";
  }
}

async function apiFetch<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // Distinguish "user not found" from generic server errors
    if (res.status === 404) {
      const json = await res.json().catch(() => ({})) as { error?: string };
      if (json.error === "user_not_found") {
        throw new UserNotFoundError();
      }
    }
    const text = await res.text().catch(() => String(res.status));
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ─── Typed helpers used by use-kanban.ts ──────────────────────────────────────

export const api = {
  columns: () => apiFetch<unknown[]>("/columns"),
  categories: () => apiFetch<unknown[]>("/categories"),

  /**
   * Fetch tasks for a Telegram user identified by their integer telegram_id.
   * The backend resolves telegram_id → UUID → filters tg_tasks.
   * Throws UserNotFoundError when the user has never run /start.
   */
  tasks: (tgId: string) =>
    apiFetch<unknown[]>(`/tasks?tg_id=${encodeURIComponent(tgId)}`),

  updateTask: (id: string, data: Record<string, unknown>) =>
    apiFetch<void>(`/tasks/${id}`, "PATCH", data),

  deleteTask: (id: string) => apiFetch<void>(`/tasks/${id}`, "DELETE"),
};

/** Read the tg_id query param from the current URL (set by the Telegram bot). */
export function getTgIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("tg_id");
}
