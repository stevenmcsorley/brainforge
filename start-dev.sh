#!/usr/bin/env bash
# BrainForge — start all services for local development
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
DB_URL="postgresql://brainforge:brainforge_dev@localhost:5432/brainforge"
REDIS_URL="redis://localhost:6379"

echo "🧠 BrainForge dev startup"
echo ""

# 1. Infrastructure (idempotent — skips if already running)
echo "▶ Starting Postgres + Redis..."
docker compose up postgres redis -d --quiet-pull 2>/dev/null
sleep 2

# 2. API
echo "▶ Starting API on :3001..."
pkill -f "node dist/main" 2>/dev/null || true
sleep 1
cd "$ROOT/apps/api"
DATABASE_URL="$DB_URL" REDIS_URL="$REDIS_URL" \
  node dist/main >> /tmp/brainforge-api.log 2>&1 &
API_PID=$!
sleep 3

# Health check
if curl -sf --max-time 3 http://localhost:3001/api/admin/health > /dev/null; then
  echo "  ✅ API up (PID $API_PID)"
else
  echo "  ❌ API failed to start — check /tmp/brainforge-api.log"
  exit 1
fi

# 3. Sim-worker (optional — only needed to actually execute runs)
echo "▶ Starting sim-worker..."
pkill -f "sim_worker.main" 2>/dev/null || true
cd "$ROOT/apps/sim-worker"
PYTHONPATH="$ROOT/python" \
SIM_WORKER_REDIS_URL="$REDIS_URL" \
SIM_WORKER_API_URL="http://127.0.0.1:3001" \
SIM_WORKER_STORAGE_PATH="/tmp/brainforge-sim" \
  python3 -m sim_worker.main >> /tmp/brainforge-worker.log 2>&1 &
echo "  ✅ Sim-worker up (PID $!)"

# 4. Frontend
echo "▶ Starting frontend on :5173..."
pkill -f "vite --host" 2>/dev/null || true
cd "$ROOT/apps/web"
npm run dev -- --host 0.0.0.0 >> /tmp/brainforge-vite.log 2>&1 &
sleep 3
echo "  ✅ Frontend up"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🌐 App:  http://localhost:5173"
echo "  🔌 API:  http://localhost:3001/api/admin/health"
echo ""
echo "  Logs:  /tmp/brainforge-api.log"
echo "         /tmp/brainforge-worker.log"
echo "         /tmp/brainforge-vite.log"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
