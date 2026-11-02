"""
=============================================================================
  AVA AGENCY BOT - Icône Système (Systray / Barre des tâches)
  Garde un œil sur le bot 24/7 et permet de le relancer en 1 clic.
=============================================================================
"""

import os
import sys
import subprocess
import threading
import time
from PIL import Image
import pystray
from pystray import MenuItem as item

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ICON_PATH  = os.path.join(SCRIPT_DIR, "ava_bot.png")
ICO_PATH   = os.path.join(SCRIPT_DIR, "ava_bot.ico")
LOG_OUT    = os.path.join(SCRIPT_DIR, "logs", "out.log")
LOG_ERR    = os.path.join(SCRIPT_DIR, "logs", "error.log")

bot_status = "Vérification..."

def check_pm2_status():
    """Vérifie si ava-agency-bot est en ligne via pm2 jlist (rapide et léger)."""
    global bot_status
    try:
        # Exécution silencieuse sans console
        result = subprocess.run(
            ["pm2", "jlist"],
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        if "ava-agency-bot" in result.stdout and '"status":"online"' in result.stdout:
            bot_status = "🟢 En ligne (24/7)"
        else:
            bot_status = "🔴 Arrêté"
    except Exception:
        bot_status = "⚠️ Inconnu"

def restart_bot_thread(icon=None):
    """Relance le bot en tâche de fond et met à jour le statut."""
    global bot_status
    bot_status = "⏳ Redémarrage en cours..."
    if icon:
        icon.title = f"AVA Bot: {bot_status}"
    
    try:
        subprocess.run(
            ["pm2", "restart", "ecosystem.config.js", "--update-env"],
            cwd=SCRIPT_DIR,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        subprocess.run(
            ["pm2", "save"],
            cwd=SCRIPT_DIR,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        time.sleep(2)
        check_pm2_status()
        if icon:
            icon.title = f"AVA Bot: {bot_status}"
            try:
                icon.notify(
                    "Bot AVA Agency et Tracker Telegram relancés avec succès !",
                    title="AVA Bot — Redémarré ✅"
                )
            except Exception:
                pass
    except Exception as e:
        bot_status = f"❌ Erreur: {e}"
        if icon:
            icon.title = f"AVA Bot: {bot_status}"

def on_restart(icon, item):
    threading.Thread(target=restart_bot_thread, args=(icon,), daemon=True).start()

def on_open_logs(icon, item):
    if os.path.exists(LOG_OUT):
        os.system(f'notepad.exe "{LOG_OUT}"')

def on_open_errors(icon, item):
    if os.path.exists(LOG_ERR):
        os.system(f'notepad.exe "{LOG_ERR}"')

def on_open_folder(icon, item):
    os.system(f'explorer.exe "{SCRIPT_DIR}"')

def on_quit(icon, item):
    icon.stop()

def get_status_label(item):
    return f"Statut : {bot_status}"

def monitor_loop(icon):
    """Boucle de surveillance légère (toutes les 10 secondes)."""
    while icon.visible:
        check_pm2_status()
        icon.title = f"AVA Bot — {bot_status}"
        time.sleep(10)

def main():
    check_pm2_status()
    
    image = Image.open(ICON_PATH)
    
    menu = pystray.Menu(
        item(get_status_label, lambda icon, item: None, enabled=False),
        pystray.Menu.SEPARATOR,
        item("🔄 Relancer le Bot (1-clic)", on_restart, default=True),
        pystray.Menu.SEPARATOR,
        item("📋 Voir les logs", on_open_logs),
        item("⚠️ Voir les erreurs", on_open_errors),
        item("📁 Ouvrir le dossier", on_open_folder),
        pystray.Menu.SEPARATOR,
        item("❌ Masquer l'icône", on_quit)
    )
    
    icon = pystray.Icon("ava_bot_tray", image, f"AVA Bot — {bot_status}", menu)
    
    # Thread de surveillance
    t = threading.Thread(target=monitor_loop, args=(icon,), daemon=True)
    t.start()
    
    icon.run()

if __name__ == "__main__":
    main()
