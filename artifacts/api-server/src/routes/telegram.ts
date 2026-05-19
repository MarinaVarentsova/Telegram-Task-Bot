/**
 * Telegram webhook routes.
 *
 * POST /api/telegram-webhook
 *   Receives updates from Telegram and proxies them to the Python bot's
 *   internal aiohttp server running on localhost:WEBHOOK_INTERNAL_PORT.
 *
 *   Retries up to MAX_PROXY_RETRIES times (with delay) before returning 503,
 *   so the bot has time to finish starting up when the first updates arrive.
 *
 * GET /api/telegram-webhook/health
 *   Probes the Python bot's internal server with retries and returns a full
 *   status report:
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

/** Wait ms milliseconds. */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ── POST /api/telegram-webhook ────────────────────────────────────────────────

const MAX_PROXY_RETRIES = 5;
const PROXY_RETRY_DELAY_MS = 2_000;

router.post("/telegram-webhook", async (req: Request, res: Response) => {
  for (let attempt = 0; attempt <= MAX_PROXY_RETRIES; attempt++) {
    try {
      const response = await fetch(BOT_INTERNAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      // Telegram only cares that we return 2xx
      res.status(response.ok ? 200 : response.status).end();
      return;
    } catch (err) {
      if (attempt < MAX_PROXY_RETRIES) {
        logger.warn(
          { attempt: attempt + 1, maxRetries: MAX_PROXY_RETRIES, retryInMs: PROXY_RETRY_DELAY_MS },
          "Bot server not ready — retrying after delay",
        );
        await sleep(PROXY_RETRY_DELAY_MS);
      } else {
        logger.error({ err }, "Failed to proxy Telegram update to bot server after all retries");
        res.status(503).json({ error: "Bot server unavailable" });
      }
    }
  }
});

// ── GET /api/telegram-webhook/health ─────────────────────────────────────────

const HEALTH_PROBE_RETRIES = 3;
const HEALTH_PROBE_DELAY_MS = 1_000;

router.get("/telegram-webhook/health", async (_req: Request, res: Response) => {
  const BOT_MODE = process.env["BOT_MODE"] ?? "not set";
  const WEBHOOK_URL = process.env["WEBHOOK_URL"] ?? "not set";

  // Probe the Python bot's internal aiohttp server with retries.
  // fetch() only throws on network errors (ECONNREFUSED, timeout).
  // A 405 response from aiogram means the server IS up (only POST is valid).
  let botStatus: "ok" | "fail" = "fail";
  let botError: string | null = null;

  for (let attempt = 0; attempt <= HEALTH_PROBE_RETRIES; attempt++) {
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 3000);
      await fetch(BOT_INTERNAL_URL, { method: "GET", signal: ctrl.signal });
      clearTimeout(timeoutId);
      botStatus = "ok"; // any HTTP response = server is listening
      botError = null;
      break;
    } catch (err) {
      botError = err instanceof Error ? err.message : String(err);
      if (attempt < HEALTH_PROBE_RETRIES) {
        await sleep(HEALTH_PROBE_DELAY_MS);
      }
    }
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
