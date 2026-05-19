/**
 * Telegram webhook routes.
 *
 * POST /api/telegram-webhook
 *   Receives updates from Telegram and proxies them to the Python bot's
 *   internal aiohttp server running on localhost:WEBHOOK_INTERNAL_PORT.
 *
 *   Flow:
 *     Telegram → Express POST /api/telegram-webhook
 *              → proxy → http://127.0.0.1:8082/ (Python aiohttp)
 *                       → aiogram Dispatcher → handlers
 *
 * GET /api/telegram-webhook/health
 *   Probes the Python bot's internal server and returns a full status report:
 *   - api: "ok"
 *   - python_bot_webhook_server: "ok" | "fail"
 *   - checked_internal_url
 *   - bot_mode, webhook_url
 *   - telegram_webhook_info (from Telegram's getWebhookInfo API)
 */

import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

const BOT_INTERNAL_PORT = process.env["WEBHOOK_INTERNAL_PORT"] ?? "8082";
const BOT_INTERNAL_URL = `http://127.0.0.1:${BOT_INTERNAL_PORT}/`;

// ── POST /api/telegram-webhook ────────────────────────────────────────────────

router.post("/telegram-webhook", async (req: Request, res: Response) => {
  try {
    const response = await fetch(BOT_INTERNAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    // Telegram only cares that we return 2xx
    res.status(response.status).end();
  } catch (err) {
    logger.error({ err }, "Failed to proxy Telegram update to bot server");
    res.status(503).json({ error: "Bot server unavailable" });
  }
});

// ── GET /api/telegram-webhook/health ─────────────────────────────────────────

router.get("/telegram-webhook/health", async (_req: Request, res: Response) => {
  const BOT_MODE = process.env["BOT_MODE"] ?? "not set";
  const WEBHOOK_URL = process.env["WEBHOOK_URL"] ?? "not set";

  // Probe the Python bot's internal aiohttp server.
  // fetch() only throws on network errors (ECONNREFUSED, timeout).
  // A 405 response from aiogram means the server IS up (only POST is valid).
  let botStatus: "ok" | "fail" = "fail";
  let botError: string | null = null;

  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 3000);
    await fetch(BOT_INTERNAL_URL, { method: "GET", signal: ctrl.signal });
    clearTimeout(timeoutId);
    botStatus = "ok"; // any HTTP response = server is listening
  } catch (err) {
    botError = err instanceof Error ? err.message : String(err);
    botStatus = "fail";
  }

  // Fetch Telegram webhook info (best-effort)
  let telegramWebhookInfo: Record<string, unknown> | null = null;
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (token) {
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 5000);
      const tgRes = await fetch(
        `https://api.telegram.org/bot${token}/getWebhookInfo`,
        { signal: ctrl.signal },
      );
      clearTimeout(timeoutId);
      const tgData = (await tgRes.json()) as {
        ok: boolean;
        result: Record<string, unknown>;
      };
      if (tgData.ok) {
        telegramWebhookInfo = tgData.result;
      }
    } catch {
      // best-effort — don't fail the health check because of this
    }
  }

  res.json({
    api: "ok",
    python_bot_webhook_server: botStatus,
    ...(botError ? { python_bot_error: botError } : {}),
    checked_internal_url: BOT_INTERNAL_URL,
    bot_mode: BOT_MODE,
    webhook_url: WEBHOOK_URL,
    ...(telegramWebhookInfo
      ? { telegram_webhook_info: telegramWebhookInfo }
      : {}),
  });
});

export default router;
