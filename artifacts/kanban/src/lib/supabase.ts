/**
 * Thin API client that talks to the Express API server (/api/kanban/*)
 * instead of hitting Supabase directly from the browser.
 *
 * Supabase's new sb_secret_* keys are blocked in browser environments,
 * so all data access is proxied through the backend.
 */

const BASE = "/api/kanban";

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
  tasks: () => apiFetch<unknown[]>("/tasks"),
  users: () => apiFetch<unknown[]>("/users"),
  updateTask: (id: string, data: Record<string, unknown>) =>
    apiFetch<void>(`/tasks/${id}`, "PATCH", data),
  deleteTask: (id: string) => apiFetch<void>(`/tasks/${id}`, "DELETE"),
};
