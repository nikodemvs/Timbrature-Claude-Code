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

log "launching start-nas.sh"
"$RUNTIME/backend/start-nas.sh"

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
