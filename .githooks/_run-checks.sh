#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PYTHON_BIN="${PYTHON:-}"

if [ -n "$PYTHON_BIN" ]; then
  exec "$PYTHON_BIN" "$ROOT_DIR/tools/checks.py" "$@"
fi

if command -v python >/dev/null 2>&1; then
  exec python "$ROOT_DIR/tools/checks.py" "$@"
fi

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$ROOT_DIR/tools/checks.py" "$@"
fi

if command -v py >/dev/null 2>&1; then
  exec py -3 "$ROOT_DIR/tools/checks.py" "$@"
fi

echo "Python non trovato: imposta PYTHON o aggiungi python/python3/py al PATH." >&2
exit 1
