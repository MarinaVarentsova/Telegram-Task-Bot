import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  const BOT_MODE = process.env["BOT_MODE"] ?? "not set";
  const WEBHOOK_URL = process.env["WEBHOOK_URL"] ?? "not set";
  const INTERNAL_PORT = process.env["WEBHOOK_INTERNAL_PORT"] ?? "8082";

  logger.info({ port }, "Server listening");
  logger.info(
    { BOT_MODE, WEBHOOK_URL, pythonBotInternalPort: INTERNAL_PORT },
    "Bot configuration",
  );

  // After startup, fetch Telegram webhook info and log it for production diagnostics
  if (BOT_MODE === "webhook") {
    setTimeout(async () => {
      const token = process.env["TELEGRAM_BOT_TOKEN"];
      if (!token) {
        logger.warn("TELEGRAM_BOT_TOKEN not set — skipping getWebhookInfo check");
        return;
      }
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/getWebhookInfo`,
        );
        const data = (await res.json()) as {
          ok: boolean;
          result: Record<string, unknown>;
        };
        if (data.ok) {
          logger.info({ webhookInfo: data.result }, "Telegram getWebhookInfo");
        } else {
          logger.warn({ data }, "Telegram getWebhookInfo returned ok=false");
        }
      } catch (err) {
        logger.error({ err }, "Failed to call Telegram getWebhookInfo");
      }
    }, 10_000); // wait 10s for Python bot to start and register the webhook
  }
});
