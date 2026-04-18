#!/bin/bash
# deploy-nas.sh — aggiorna backend su Synology NAS dall'origin/main e riavvia uvicorn.
#
# Esecuzione: ssh "Marco Zambara@nas" "/volume1/homes/Marco Zambara/timbrature-repo/ops/deploy-nas.sh"
#
# Flusso:
#   1. git fetch + reset hard a origin/main in timbrature-repo
#   2. rsync backend/ -> timbrature/backend/ preservando .env, DB, __pycache__
#   3. kill uvicorn stale + relancio via start-nas.sh idempotente
#   4. health check su /openapi.json
#
# Frontend: non gestito qui (vedi ops/build-web.sh lato sandbox).
#
# Exit codes: 0 = OK, 1 = errore generico, 2 = health check fallito.

set -euo pipefail

REPO="/volume1/homes/Marco Zambara/timbrature-repo"
RUNTIME="/volume1/homes/Marco Zambara/timbrature"
BACKEND_PORT=8001
HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/openapi.json"
HEALTH_TIMEOUT=20

log() { echo "[deploy-nas] $(date +%H:%M:%S) $*"; }

# --- 1. Sync repo ---
log "cd $REPO"
cd "$REPO"

log "git fetch origin main"
git fetch origin main

OLD_SHA=$(git rev-parse HEAD)
git reset --hard origin/main
NEW_SHA=$(git rev-parse HEAD)

if [ "$OLD_SHA" = "$NEW_SHA" ]; then
  log "no changes ($NEW_SHA)"
else
  log "updated: $OLD_SHA -> $NEW_SHA"
fi

# --- 2. Rsync backend source to runtime path (preserve stato locale) ---
log "rsync backend/ -> runtime"
rsync -a --delete \
  --exclude='.env' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='bustapaga.db' \
  --exclude='bustapaga.db-shm' \
  --exclude='bustapaga.db-wal' \
  "$REPO/backend/" "$RUNTIME/backend/"

# --- 3. Restart backend ---
log "killing stale uvicorn (if any)"
pkill -f "uvicorn server_nas:app" 2>/dev/null || true
sleep 1

log "launching uvicorn (detached via python double-fork)"
# start-nas.sh fa `exec uvicorn` foreground => blocca SSH. Qui lanciamo uvicorn
# direttamente detached con python double-fork (stessa tecnica di ts-ensure
# in sandbox). Così SSH session puo' chiudere senza killare uvicorn.
UVICORN_LOG="/tmp/uvicorn-deploy-$$.log"
USER_SITE="/var/services/homes/Marco Zambara/.local/lib/python3.9/site-packages"
export PYTHONPATH="${USER_SITE}${PYTHONPATH:+:${PYTHONPATH}}"

/usr/local/bin/python3.9 -c "
import os, sys
# First fork
if os.fork() > 0: os._exit(0)
os.setsid()
# Second fork — il grandchild diventa processo di init-owned
if os.fork() > 0: os._exit(0)
os.chdir('$RUNTIME/backend')
sys.stdin.close()
log = open('$UVICORN_LOG', 'ab', 0)
os.dup2(log.fileno(), 1)
os.dup2(log.fileno(), 2)
os.execv('/usr/local/bin/python3.9',
  ['/usr/local/bin/python3.9','-m','uvicorn','server_nas:app','--host','0.0.0.0','--port','$BACKEND_PORT'])
"

# --- 4. Health check ---
log "waiting backend up (timeout ${HEALTH_TIMEOUT}s)"
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  if curl -sf --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
    log "backend healthy ($HEALTH_URL)"
    log "deploy OK (HEAD=$NEW_SHA)"
    exit 0
  fi
  sleep 1
done

log "ERROR: backend non risponde dopo ${HEALTH_TIMEOUT}s su $HEALTH_URL"
exit 2
