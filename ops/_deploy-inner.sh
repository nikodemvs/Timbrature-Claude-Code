#!/bin/bash
# _deploy-inner.sh — worker chiamato da deploy-nas.sh dopo git pull.
#
# Fa: rsync backend (preservando stato runtime), restart uvicorn detached
# via python double-fork, health check.
#
# Non richiamare direttamente: passa da deploy-nas.sh.
#
# Exit codes: 0 = OK, 1 = errore generico, 2 = health check fallito.

set -euo pipefail

REPO="/volume1/homes/Marco Zambara/timbrature-repo"
RUNTIME="/volume1/homes/Marco Zambara/timbrature"
BACKEND_PORT=8001
HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/openapi.json"
HEALTH_TIMEOUT=30
PYTHON="/usr/local/bin/python3.9"
USER_SITE="/var/services/homes/Marco Zambara/.local/lib/python3.9/site-packages"

log() { echo "[deploy-inner] $(date +%H:%M:%S) $*"; }

HEAD_SHA=$(cd "$REPO" && git rev-parse HEAD)
log "HEAD=$HEAD_SHA"

# --- 1. Rsync backend source to runtime path (preserve stato locale) ---
log "rsync backend/ -> runtime"
rsync -a --delete \
  --exclude='.env' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='bustapaga.db' \
  --exclude='bustapaga.db-shm' \
  --exclude='bustapaga.db-wal' \
  "$REPO/backend/" "$RUNTIME/backend/"

# --- 2. Kill stale uvicorn ---
log "killing stale uvicorn (if any)"
pkill -f "uvicorn server_nas:app" 2>/dev/null || true
sleep 1

# --- 3. Launch uvicorn detached via python double-fork ---
UVICORN_LOG="/tmp/uvicorn-deploy.log"
log "launching uvicorn detached (log: $UVICORN_LOG)"

export PYTHONPATH="${USER_SITE}${PYTHONPATH:+:${PYTHONPATH}}"

"$PYTHON" <<PYEOF
import os, sys
# Double-fork detach dal controlling terminal + SSH session
if os.fork() > 0: os._exit(0)
os.setsid()
if os.fork() > 0: os._exit(0)

# Grandchild — ora davvero orfano, adopted by init (PID 1)
os.chdir("$RUNTIME/backend")
sys.stdin.close()

log = open("$UVICORN_LOG", "ab", 0)
os.dup2(log.fileno(), 1)
os.dup2(log.fileno(), 2)
log.close()

# Replace with uvicorn. argv[0] DEVE essere path assoluto o Python
# non trova encodings (ModuleNotFoundError: No module named 'encodings')
os.execv("$PYTHON", ["$PYTHON", "-m", "uvicorn", "server_nas:app",
                     "--host", "0.0.0.0", "--port", "$BACKEND_PORT"])
PYEOF

# --- 4. Health check ---
log "waiting backend up (timeout ${HEALTH_TIMEOUT}s)"
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  if curl -sf --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
    log "backend healthy ($HEALTH_URL)"
    log "deploy OK (HEAD=$HEAD_SHA)"
    exit 0
  fi
  sleep 1
done

log "ERROR: backend non risponde dopo ${HEALTH_TIMEOUT}s"
log "log uvicorn: $UVICORN_LOG"
tail -20 "$UVICORN_LOG" 2>/dev/null || true
exit 2
