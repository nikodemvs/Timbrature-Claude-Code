#!/bin/bash
# build-web.sh — builda frontend Expo in sandbox e lo rsynca al NAS.
#
# Eseguire in sandbox dal root del repo:
#   ./ops/build-web.sh
#
# Richiede:
#   - Node 20+ e npm/npx in sandbox
#   - SSH verso NAS funzionante (via ts-ensure + Tailscale)
#
# Flusso:
#   1. cd frontend && npm ci (se node_modules mancante o lock cambiato)
#   2. npx expo export --platform web --output-dir ../build-web
#   3. rsync build-web/ -> NAS:timbrature/frontend-web/
#
# Nota: http.server su NAS serve contenuto dinamicamente, no restart necessario.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend"
BUILD_OUT="$ROOT/build-web"
NAS_SSH_HOST="Marco Zambara@nas"
NAS_TARGET="/volume1/homes/Marco Zambara/timbrature/frontend-web/"
TS_ENSURE="$HOME/.local/bin/ts-ensure"

log() { echo "[build-web] $(date +%H:%M:%S) $*"; }

# --- 1. Install deps ---
cd "$FRONTEND"

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  log "npm ci (lock cambiato o node_modules mancante)"
  npm ci
else
  log "node_modules up-to-date, skip npm ci"
fi

# --- 2. Expo export web ---
log "npx expo export --platform web"
rm -rf "$BUILD_OUT"
npx expo export --platform web --output-dir "$BUILD_OUT"

# --- 3. Rsync to NAS ---
log "rsync -> NAS ($NAS_TARGET)"
"$TS_ENSURE" rsync -az --delete \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  "$BUILD_OUT/" "$NAS_SSH_HOST:$NAS_TARGET"

log "build-web OK"
