#!/usr/bin/env bash
# OpenClaw Platform — Deploy to server (run this ON the server to go live or update)
# Usage: from repo root on server: ./scripts/deploy-to-server.sh
# First-time: complete SETUP_GUIDE.md through Step 15 (migrations), then run this script.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_ROOT"

echo "=== OpenClaw deploy (repo: $REPO_ROOT) ==="

# Prerequisites
if ! command -v node &>/dev/null; then
  echo "Error: Node.js not found. Install it first (see SETUP_GUIDE.md Step 4)."
  exit 1
fi
if ! command -v npm &>/dev/null; then
  echo "Error: npm not found. Install Node.js first (see SETUP_GUIDE.md Step 4)."
  exit 1
fi
if [[ ! -f "$REPO_ROOT/api/.env" ]]; then
  echo "Error: api/.env missing. Copy .env.example and fill it (SETUP_GUIDE.md Step 14)."
  exit 1
fi

echo "Installing dependencies..."
npm install

echo "Running database migrations..."
npm run migrate

echo "Building API..."
npm run build:api

echo "Building dashboard..."
npm run build:dashboard

# PM2: install if missing
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
fi

# Start or restart API (cwd must be api so dist/index.js and .env are found)
if pm2 describe openclaw-api &>/dev/null; then
  echo "Restarting openclaw-api..."
  pm2 restart openclaw-api
else
  echo "Starting openclaw-api..."
  (cd "$REPO_ROOT/api" && pm2 start dist/index.js --name openclaw-api)
fi

# Start or restart dashboard (cwd must be dashboard for npm start)
if pm2 describe openclaw-dashboard &>/dev/null; then
  echo "Restarting openclaw-dashboard..."
  pm2 restart openclaw-dashboard
else
  echo "Starting openclaw-dashboard..."
  (cd "$REPO_ROOT/dashboard" && pm2 start npm --name openclaw-dashboard -- start)
fi

pm2 save
echo ""
echo "=== Deploy done. Apps running under PM2. ==="
echo "  pm2 list          — see status"
echo "  pm2 logs          — view logs"
echo "  pm2 monit         — live monitor"
echo ""
if ! pm2 startup 2>&1 | grep -q "already setup"; then
  echo "Run 'pm2 startup' and run the command it prints so apps start on server reboot."
fi
