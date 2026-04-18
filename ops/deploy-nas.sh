#!/bin/bash
# deploy-nas.sh — bootstrap deploy su Synology NAS.
#
# Fa solo: git fetch + reset hard a origin/main, poi exec del reale worker
# _deploy-inner.sh. Questa separazione evita che bash legga metà di una
# versione vecchia e metà di una nuova se git aggiorna il file durante run.
#
# Uso: ssh "Marco Zambara@nas" "/volume1/homes/Marco Zambara/timbrature-repo/ops/deploy-nas.sh"

set -euo pipefail

REPO="/volume1/homes/Marco Zambara/timbrature-repo"

log() { echo "[deploy-nas] $(date +%H:%M:%S) $*"; }

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

log "exec worker _deploy-inner.sh"
exec "$REPO/ops/_deploy-inner.sh" "$@"
