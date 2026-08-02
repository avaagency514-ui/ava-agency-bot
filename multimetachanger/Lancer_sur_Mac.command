#!/usr/bin/env bash

# Se placer dans le dossier où se trouve ce script
cd "$(dirname "$0")"

echo "=========================================="
echo "    Démarrage de MultiMetaChanger (Mac)"
echo "=========================================="

# Vérifier si Python 3 est installé
if ! command -v python3 &> /dev/null; then
    echo "❌ ERREUR : Python3 n'est pas installé sur ce Mac."
    echo "Veuillez installer Python (depuis python.org ou via Homebrew)."
    echo "Appuyez sur Entrée pour quitter..."
    read
    exit 1
fi

# Vérifier si FFmpeg est installé
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️ ATTENTION : FFmpeg n'est pas détecté sur ce système."
    echo "L'application risque de ne pas pouvoir modifier les vidéos."
    echo "Pour l'installer, ouvrez un autre Terminal et tapez :"
    echo "brew install ffmpeg"
    echo "------------------------------------------"
    sleep 2
fi

echo "Vérification de l'environnement virtuel..."
# On crée un dossier venv spécifique au Mac pour éviter les conflits si on a copié le venv de Windows
if [ ! -d "venv_mac" ]; then
    echo "Création de l'environnement virtuel (venv_mac)..."
    python3 -m venv venv_mac
fi

echo "Activation de l'environnement..."
source venv_mac/bin/activate

echo "Installation/Mise à jour des dépendances..."
pip install -r requirements.txt

echo "Démarrage du logiciel..."
echo "Une page web va s'ouvrir automatiquement dans quelques secondes."

# Ouvre le navigateur par défaut après 2 secondes
(sleep 2 && open "http://127.0.0.1:5000") &

# Lance le serveur Python
python3 app.py
