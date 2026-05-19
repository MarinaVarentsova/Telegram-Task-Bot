#!/bin/bash
# Production start script — Telegram Task Bot
#
# Starts both:
#   1. Python Telegram bot (aiohttp webhook server on WEBHOOK_INTERNAL_PORT)
#   2. Node.js Express API server (on PORT)
#
# Monitors both. Exits with code 1 if either process crashes so Replit restarts.

set -euo pipefail

echo "============================================"
echo "  Production Stack: Telegram Task Bot"
echo "============================================"
echo "  BOT_MODE              = ${BOT_MODE:-not set}"
echo "  WEBHOOK_URL           = ${WEBHOOK_URL:-not set}"
echo "  PORT (Express)        = ${PORT:-8080}"
echo "  WEBHOOK_INTERNAL_PORT = ${WEBHOOK_INTERNAL_PORT:-8082}"
echo "============================================"

# ── 1. Start Python Telegram bot (webhook mode) ───────────────────────────────
echo "[start-production] Starting Python Telegram bot..."
python3 bot/main.py &
BOT_PID=$!
echo "[start-production] Python bot started. PID=$BOT_PID"

# ── 2. Start Express API server ───────────────────────────────────────────────
echo "[start-production] Starting Express API server..."
node --enable-source-maps artifacts/api-server/dist/index.mjs &
EXPRESS_PID=$!
echo "[start-production] Express API server started. PID=$EXPRESS_PID"

# ── Graceful shutdown ─────────────────────────────────────────────────────────
cleanup() {
  echo "[start-production] Shutdown signal received. Stopping all processes..."
  kill "$BOT_PID" "$EXPRESS_PID" 2>/dev/null || true
  wait "$BOT_PID" "$EXPRESS_PID" 2>/dev/null || true
  echo "[start-production] All processes stopped."
  exit 0
}
trap cleanup SIGTERM SIGINT SIGQUIT

# ── Monitor loop ──────────────────────────────────────────────────────────────
echo "[start-production] Both processes running. Monitoring every 10s..."
while true; do
  sleep 10

  if ! kill -0 "$BOT_PID" 2>/dev/null; then
    echo "[start-production] FATAL: Python bot (PID=$BOT_PID) has exited. Stopping Express."
    kill "$EXPRESS_PID" 2>/dev/null || true
    exit 1
  fi

  if ! kill -0 "$EXPRESS_PID" 2>/dev/null; then
    echo "[start-production] FATAL: Express (PID=$EXPRESS_PID) has exited. Stopping bot."
    kill "$BOT_PID" 2>/dev/null || true
    exit 1
  fi
done
