# Script de compilation pour MultiMetaChanger
import os
import shutil
import subprocess
from pathlib import Path

print("🚀 Démarrage de la compilation de MultiMetaChanger...")

# 1. Nettoyage des anciens builds
for folder in ['build', 'dist', 'MultiMetaChanger_Client']:
    if os.path.exists(folder):
        print(f"🧹 Nettoyage de {folder}/")
        shutil.rmtree(folder, ignore_errors=True)

# 2. Lancement de PyInstaller (mode --onedir pour plus de stabilité avec Flask)
# On inclut app.py. PyInstaller va trouver les dépendances (license_check.py etc.) automatiquement.
print("🔨 Compilation du code Python en exécutable (cela peut prendre 1-2 minutes)...")
subprocess.run([
    r"venv\Scripts\pyinstaller",
    "--noconfirm",
    "--windowed", # Ne pas afficher la console noire en arrière-plan
    "--icon=NONE", # On pourra ajouter une icône plus tard
    "--name=MultiMetaChanger",
    "--add-data=templates;templates",
    "--add-data=static;static",
    "app.py"
], check=True)

# 3. Préparation du dossier final pour le client
print("📦 Préparation du dossier client final...")
client_dir = Path("MultiMetaChanger_Client")
client_dir.mkdir(exist_ok=True)

# Déplacer l'app compilée
shutil.move("dist/MultiMetaChanger", client_dir / "App")

# Copier les exécutables FFmpeg nécessaires
print("🎥 Copie des outils vidéo (FFmpeg)...")
for exe in ['ffmpeg.exe', 'ffprobe.exe']:
    if os.path.exists(exe):
        shutil.copy(exe, client_dir / "App" / "_internal" / exe) # FFmpeg doit être accessible par l'app
        # Aussi à la racine de l'app au cas où
        shutil.copy(exe, client_dir / "App" / exe)

# Créer un petit fichier texte d'instructions
with open(client_dir / "LISEZ_MOI.txt", "w", encoding="utf-8") as f:
    f.write("""Bienvenue sur MultiMetaChanger !

Pour lancer le logiciel :
1. Ouvrez le dossier 'App'
2. Double-cliquez sur 'MultiMetaChanger.exe'
3. Entrez la clé de licence reçue par email.

Bonne utilisation !
""")

# Nettoyage final
shutil.rmtree("build", ignore_errors=True)
shutil.rmtree("dist", ignore_errors=True)
if os.path.exists("MultiMetaChanger.spec"):
    os.remove("MultiMetaChanger.spec")

print("✅ COMPILATION TERMINÉE !")
print(f"📁 Le dossier à zipper et envoyer à vos clients est : {client_dir.absolute()}")
