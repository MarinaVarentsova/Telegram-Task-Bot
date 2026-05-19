import { spawn } from "child_process";
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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // In production + webhook mode, spawn the Python bot as a child process.
  // The workspace "Telegram Bot" workflow handles dev/polling mode separately.
  const BOT_MODE = process.env["BOT_MODE"];
  const isProduction = process.env["NODE_ENV"] === "production";

  if (BOT_MODE === "webhook" && isProduction) {
    const workspaceRoot = path.resolve(process.cwd());
    const botScript = path.join(workspaceRoot, "bot", "main.py");

    logger.info({ botScript }, "Starting Python bot process (webhook mode)");

    const botProcess = spawn("python3", [botScript], {
      cwd: workspaceRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    botProcess.stdout?.on("data", (data: Buffer) => {
      process.stdout.write(data);
    });

    botProcess.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(data);
    });

    botProcess.on("error", (err: Error) => {
      logger.error({ err }, "Bot process failed to start");
    });

    botProcess.on("exit", (code: number | null, signal: string | null) => {
      logger.warn({ code, signal }, "Bot process exited unexpectedly");
    });
  }
});
