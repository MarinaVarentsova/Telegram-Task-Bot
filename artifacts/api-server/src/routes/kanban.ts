import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const SUPABASE_URL = process.env["SUPABASE_URL"] ?? "";
const SUPABASE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

function sbHeaders(prefer?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (prefer) h["Prefer"] = prefer;
  return h;
}

async function sbFetch(
  path: string,
  method = "GET",
  body?: unknown,
  prefer?: string,
): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: sbHeaders(prefer),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status));
    throw Object.assign(new Error(`Supabase ${res.status}: ${text}`), {
      status: res.status,
    });
  }

  if (res.status === 204 || method === "DELETE") return [];
  return res.json();
}

function handleError(res: Response, err: unknown) {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status: number }).status
      : 500;
  const message =
    err instanceof Error ? err.message : "Internal server error";
  res.status(status).json({ error: message });
}

// GET /api/kanban/columns
router.get("/columns", async (_req: Request, res: Response) => {
  try {
    const data = await sbFetch(
      "tg_board_columns?select=*&order=sort_order.asc",
    );
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/kanban/categories
router.get("/categories", async (_req: Request, res: Response) => {
  try {
    const data = await sbFetch("tg_categories?select=*&order=name.asc");
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/kanban/tasks
router.get("/tasks", async (_req: Request, res: Response) => {
  try {
    const data = await sbFetch("tg_tasks?select=*&order=created_at.desc");
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/kanban/users
router.get("/users", async (_req: Request, res: Response) => {
  try {
    const data = await sbFetch("tg_users?select=*");
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

// PATCH /api/kanban/tasks/:id
router.patch("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await sbFetch(
      `tg_tasks?id=eq.${id}`,
      "PATCH",
      req.body,
      "return=representation",
    );
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

// DELETE /api/kanban/tasks/:id
router.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await sbFetch(`tg_tasks?id=eq.${id}`, "DELETE");
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
