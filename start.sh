#!/bin/bash

# Start the Python Flask app (MultiMetaChanger) in the background
echo "Démarrage de MultiMetaChanger (API Python)..."
cd multimetachanger
python3 -u app.py &
cd ..

# Wait a couple of seconds to ensure the API is up
sleep 3

# Start the Discord bot in the foreground
echo "Démarrage de AVA Agency Bot..."
node index.js
