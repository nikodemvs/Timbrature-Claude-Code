#!/bin/bash
# Avvio backend NAS — Synology DS220j (ARM, Python 3.9)
# Prima di usarlo: chmod +x start-nas.sh
cd "$(dirname "$0")"
export PORT=8001
python3 -m uvicorn server_nas:app --host 0.0.0.0 --port $PORT --workers 1
