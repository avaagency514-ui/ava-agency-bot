#!/bin/bash
set -e

echo "=== Demarrage MultiMetaChanger (Python Flask) ==="
export SKIP_SPAWN_PYTHON=true
cd /app/multimetachanger
python3 -u app.py &
PYTHON_PID=$!
cd /app

echo "=== Attente demarrage API (5 secondes) ==="
sleep 5

# Verifier si Python est toujours actif
if kill -0 $PYTHON_PID 2>/dev/null; then
    echo "=== API Python OK (PID: $PYTHON_PID) ==="
else
    echo "=== ERREUR: API Python a crashe! ==="
    exit 1
fi

echo "=== Demarrage Telegram Welcome Bot (Kim 💖) ==="
cd /app/telegram/welcome
python3 -u run_welcome.py &
cd /app

echo "=== Demarrage Telegram Planning Bot (Kim 💖) ==="
cd /app/telegram/planning
python3 -u run_planning.py &
cd /app

echo "=== Demarrage AVA Agency Bot (Node.js) ==="
node /app/index.js
