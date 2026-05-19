import { spawn } from "child_process";
import net from "net";
import path from "path";
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

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns true if the given TCP port on host is NOT already in use. */
function isTcpPortFree(tcpPort: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false)); // EADDRINUSE — port occupied
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(tcpPort, host);
  });
}

// ── Python bot spawner ────────────────────────────────────────────────────────

/**
 * Spawns the Python Telegram bot as a child process when BOT_MODE=webhook
 * and the internal port is free (not already occupied by an external bot process,
 * e.g. the "Telegram Bot" workspace workflow in dev mode).
 *
 * stdout/stderr are piped through Express so they appear in production logs.
 * Auto-restarts on crash with a 5-second delay.
 */
async function spawnPythonBot(): Promise<void> {
  const BOT_MODE = process.env["BOT_MODE"];

  if (BOT_MODE !== "webhook") {
    logger.info({ BOT_MODE }, "BOT_MODE != webhook — skipping Python bot spawn");
    return;
  }

  const internalPort = parseInt(
    process.env["WEBHOOK_INTERNAL_PORT"] ?? "8082",
    10,
  );

  const portFree = await isTcpPortFree(internalPort, "127.0.0.1");
  if (!portFree) {
    // Workspace scenario: "Telegram Bot" workflow is already running on this port.
    logger.info(
      { internalPort },
      "Python bot port already in use — bot running externally, skipping spawn",
    );
    return;
  }

  const workspaceRoot = path.resolve(process.cwd());
  const botScript = path.join(workspaceRoot, "bot", "main.py");

  logger.info(
    { botScript, internalPort },
    "Port free — spawning Python bot process",
  );

  // Resolve the actual python3 executable path for better diagnostics
  const pythonBin = process.env["PYTHON_BIN"] ?? "python3";

  const startBot = (): void => {
    const botProcess = spawn(pythonBin, ["-u", botScript], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1", // disable Python output buffering
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Pipe Python stdout/stderr straight into Express process streams
    // so they appear in production deployment logs.
    botProcess.stdout?.on("data", (data: Buffer) => {
      process.stdout.write(data);
    });
    botProcess.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(data);
    });

    botProcess.on("error", (err: Error) => {
      logger.error(
        { err, pythonBin },
        "Python bot spawn error — is python3 in PATH?",
      );
      logger.info("Retrying Python bot in 5s...");
      setTimeout(startBot, 5_000);
    });

    botProcess.on("exit", (code: number | null, signal: string | null) => {
      if (code !== null || signal !== null) {
        logger.warn(
          { code, signal },
          "Python bot exited unexpectedly — restarting in 5s",
        );
        setTimeout(startBot, 5_000);
      }
    });
  };

  startBot();
}

// ── Server startup ────────────────────────────────────────────────────────────

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

  // Spawn Python bot if needed (webhook mode + port free)
  spawnPythonBot().catch((err) =>
    logger.error({ err }, "Failed during Python bot spawn check"),
  );

  // 12 s after startup — log Telegram webhook info for production diagnostics
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
      } catch (tgErr) {
        logger.error({ err: tgErr }, "Failed to call Telegram getWebhookInfo");
      }
    }, 12_000);
  }
});
