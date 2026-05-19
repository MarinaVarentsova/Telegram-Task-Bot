import { spawn, type ChildProcess } from "child_process";
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

/** Returns true if port is accepting TCP connections (i.e. something is listening). */
function isTcpPortOpen(tcpPort: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const cleanup = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => cleanup(true));
    socket.once("error", () => cleanup(false));
    socket.once("timeout", () => cleanup(false));
    socket.connect(tcpPort, host);
  });
}

/** Forward each non-empty line from a Buffer through the structured logger. */
function logPythonOutput(
  data: Buffer,
  level: "info" | "error",
): void {
  const text = data.toString();
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.length > 0) {
      if (level === "error") {
        logger.error({ src: "python-bot" }, line);
      } else {
        logger.info({ src: "python-bot" }, line);
      }
    }
  }
}

// ── Python bot spawner ────────────────────────────────────────────────────────

/**
 * Spawns the Python Telegram bot as a child process when BOT_MODE=webhook
 * and the internal port is free (not occupied by an external bot process,
 * e.g. the "Telegram Bot" workspace workflow in dev mode).
 *
 * Features:
 * - All Python stdout/stderr forwarded through Pino structured logger
 * - Auto-restarts on crash with a 5-second delay
 * - Startup watchdog: if port not open within 60s, kills and restarts Python
 * - Periodic liveness check every 60s: restarts if port goes down
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
    // Workspace scenario: "Telegram Bot" workflow already running on this port.
    logger.info(
      { internalPort },
      "Python bot port already in use — bot running externally, skipping spawn",
    );
    return;
  }

  // process.cwd() is the api-server dir when started via pnpm, NOT the workspace
  // root. Use import.meta.url to walk up reliably:
  //   dist/index.mjs → api-server/ → artifacts/ → workspace root
  const _thisFile = new URL(import.meta.url).pathname;
  const workspaceRoot = path.resolve(path.dirname(_thisFile), "..", "..", "..");
  const botScript = path.join(workspaceRoot, "bot", "main.py");
  const pythonBin = process.env["PYTHON_BIN"] ?? "python3";

  logger.info(
    { botScript, internalPort, pythonBin },
    "Port free — spawning Python bot process",
  );

  let currentProcess: ChildProcess | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;

  const killCurrent = (): void => {
    if (currentProcess && !currentProcess.killed) {
      logger.warn({ pid: currentProcess.pid }, "Killing stale Python bot process");
      currentProcess.kill("SIGKILL");
      currentProcess = null;
    }
  };

  const startBot = (): void => {
    // Clear any pending startup timeout from a previous attempt
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }

    const botProcess = spawn(pythonBin, ["-u", botScript], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1", // belt-and-suspenders alongside -u
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    currentProcess = botProcess;
    logger.info({ pid: botProcess.pid }, "Python bot process spawned");

    // Route Python output through Pino so it appears as structured JSON in
    // Replit's production log aggregator (plain-text stdout is silently dropped).
    botProcess.stdout?.on("data", (data: Buffer) =>
      logPythonOutput(data, "info"),
    );
    botProcess.stderr?.on("data", (data: Buffer) =>
      logPythonOutput(data, "error"),
    );

    botProcess.on("error", (err: Error) => {
      logger.error(
        { err, pythonBin, botScript },
        "Python bot spawn error — python3 not found or failed to exec",
      );
      currentProcess = null;
      logger.info("Retrying Python bot in 5s...");
      setTimeout(startBot, 5_000);
    });

    botProcess.on("exit", (code: number | null, signal: string | null) => {
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }
      logger.warn(
        { exitCode: code, signal, pid: botProcess.pid },
        "Python bot process exited — restarting in 5s",
      );
      currentProcess = null;
      setTimeout(startBot, 5_000);
    });

    // ── Startup watchdog ──────────────────────────────────────────────────────
    // If Python hasn't bound the port within 60s, something is stuck
    // (e.g. Telegram API call hanging without timeout). Kill and restart.
    startupTimer = setTimeout(async () => {
      startupTimer = null;
      const open = await isTcpPortOpen(internalPort, "127.0.0.1");
      if (!open) {
        logger.error(
          { pid: botProcess.pid, internalPort, waitedMs: 60_000 },
          "Python bot startup watchdog: port still closed after 60s — killing and restarting",
        );
        killCurrent();
        setTimeout(startBot, 2_000);
      } else {
        logger.info(
          { pid: botProcess.pid, internalPort },
          "Python bot startup watchdog: port is open — bot is healthy",
        );
        // Start the periodic liveness monitor only after confirmed first open
        startLivenessMonitor();
      }
    }, 60_000);
  };

  // ── Periodic liveness monitor ───────────────────────────────────────────────
  // After the bot is confirmed running, check every 60s that it's still alive.
  const startLivenessMonitor = (): void => {
    if (watchdogTimer) return; // already running
    watchdogTimer = setInterval(async () => {
      const open = await isTcpPortOpen(internalPort, "127.0.0.1");
      if (!open) {
        logger.error(
          { internalPort },
          "Python bot liveness check: port closed — killing and restarting",
        );
        if (watchdogTimer) {
          clearInterval(watchdogTimer);
          watchdogTimer = null;
        }
        killCurrent();
        setTimeout(startBot, 2_000);
      } else {
        logger.info({ internalPort }, "Python bot liveness check: ok");
      }
    }, 60_000);
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
