#!/bin/bash

# Start the Python Flask app (MultiMetaChanger) in the background
echo "Démarrage de MultiMetaChanger (API Python)..."
cd multimetachanger
python3 -u app.py > python_api.log 2>&1 &
cd ..

# Wait a couple of seconds to ensure the API is up
sleep 3

# Print the Python API logs to see if it crashed
echo "=== LOGS API PYTHON ==="
cat multimetachanger/python_api.log
echo "======================="

# Start the Discord bot in the foreground
echo "Démarrage de AVA Agency Bot..."
node index.js
