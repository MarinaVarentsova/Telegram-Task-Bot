/**
 * Telegram webhook proxy.
 *
 * Telegram sends POST updates to:
 *   https://<domain>/api/telegram-webhook
 *
 * This route forwards the raw JSON body to the Python bot's internal
 * aiohttp server running on localhost:WEBHOOK_INTERNAL_PORT (default 8082).
 *
 * The Python bot (aiogram 3) processes the update via its Dispatcher
 * and returns 200 OK when done.
 *
 * Flow:
 *   Telegram → Express POST /api/telegram-webhook
 *            → proxy → localhost:8082/ (Python aiohttp)
 *                     → aiogram Dispatcher
 */

import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

const BOT_INTERNAL_PORT = process.env["WEBHOOK_INTERNAL_PORT"] ?? "8082";
const BOT_INTERNAL_URL = `http://127.0.0.1:${BOT_INTERNAL_PORT}/`;

router.post("/telegram-webhook", async (req: Request, res: Response) => {
  try {
    const response = await fetch(BOT_INTERNAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // req.body is already parsed by express.json(); re-stringify for the bot
      body: JSON.stringify(req.body),
    });

    // Telegram only cares that we return 2xx
    res.status(response.status).end();
  } catch (err) {
    // Python bot is down or not started in webhook mode
    logger.error({ err }, "Failed to proxy Telegram update to bot server");
    res.status(503).json({ error: "Bot server unavailable" });
  }
});

export default router;
