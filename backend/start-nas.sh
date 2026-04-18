#!/bin/bash
cd "$(dirname "$0")"
PORT=8001
HEALTH_URL="http://127.0.0.1:${PORT}/openapi.json"
USER_SITE="/var/services/homes/Marco Zambara/.local/lib/python3.9/site-packages"

# Skip start if backend is already healthy.
if /usr/bin/curl --max-time 3 -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  exit 0
fi

# Clear stale uvicorn instances to avoid zombie/blocked states after reboot.
PIDS=$(/bin/ps -eo pid,args | /bin/awk '/uvicorn server_nas:app --host 0.0.0.0 --port 8001/ {print $1}')
if [ -n "$PIDS" ]; then
  /bin/kill $PIDS >/dev/null 2>&1 || true
  /bin/sleep 1
fi

export PYTHONPATH="${USER_SITE}:${PYTHONPATH}"
exec /usr/local/bin/python3.9 -m uvicorn server_nas:app --host 0.0.0.0 --port "$PORT"
