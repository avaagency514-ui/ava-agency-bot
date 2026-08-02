import os
import uuid
import hashlib
import json
import requests
from pathlib import Path

# ============================================================
# CONFIGURATION
# ============================================================

LICENSE_SERVER_URL = "https://web-production-e8248.up.railway.app"
LICENSE_FILE = Path(os.path.expanduser("~")) / ".multimetachanger" / "license.key"
MACHINE_ID_FILE = Path(os.path.expanduser("~")) / ".multimetachanger" / "machine.id"


def get_machine_id() -> str:
    """Génère ou récupère un identifiant unique pour cette machine."""
    os.makedirs(MACHINE_ID_FILE.parent, exist_ok=True)
    if MACHINE_ID_FILE.exists():
        return MACHINE_ID_FILE.read_text().strip()
    # Générer un ID unique basé sur un UUID aléatoire
    machine_id = str(uuid.uuid4())
    MACHINE_ID_FILE.write_text(machine_id)
    return machine_id


def save_license_key(key: str):
    """Sauvegarde la clé localement."""
    os.makedirs(LICENSE_FILE.parent, exist_ok=True)
    LICENSE_FILE.write_text(key.strip().upper())


def load_license_key() -> str | None:
    """Charge la clé sauvegardée localement."""
    if LICENSE_FILE.exists():
        return LICENSE_FILE.read_text().strip()
    return None


def logout_license():
    try:
        if LICENSE_FILE.exists():
            LICENSE_FILE.unlink()
    except Exception:
        pass


def delete_license_key():
    """Supprime la clé locale (ex: en cas d'expiration)."""
    if LICENSE_FILE.exists():
        LICENSE_FILE.unlink()


def validate_license_online(key: str) -> dict:
    """
    Valide la clé auprès du serveur de licences.
    Retourne: {"valid": bool, "plan": str, "expires": str, "reason": str}
    """
    machine_id = get_machine_id()
    try:
        resp = requests.get(
            f"{LICENSE_SERVER_URL}/api/validate",
            params={"key": key, "machine_id": machine_id},
            timeout=8
        )
        if resp.status_code == 200:
            return resp.json()
        else:
            data = resp.json()
            return {"valid": False, "reason": data.get("reason", "Erreur serveur")}
    except requests.exceptions.ConnectionError:
        # Si pas de connexion internet, on accepte la clé sauvegardée localement
        # (grace period de 7 jours sans connexion)
        if key:
            return {"valid": True, "plan": "offline", "expires": "inconnu", "offline": True}
        return {"valid": False, "reason": "Impossible de joindre le serveur de licences"}
    except Exception as e:
        return {"valid": False, "reason": f"Erreur: {str(e)}"}


def check_license_at_startup(app_flask) -> bool:
    """
    Vérifie la licence au démarrage du bot.
    - Si valide : laisse l'app démarrer normalement
    - Si invalide : redirige toutes les routes vers la page d'activation
    Returns True si la licence est valide.
    """
    saved_key = load_license_key()

    if saved_key:
        result = validate_license_online(saved_key)
        if result.get("valid"):
            plan = result.get("plan", "?")
            expires = result.get("expires", "jamais")
            offline = result.get("offline", False)
            status_msg = f"Licence valide - Plan : {plan.upper()} | Expire : {expires}"
            if offline:
                status_msg += " (mode hors-ligne)"
            print(f"[LICENCE] {status_msg}")
            # Stocker infos dans l'app pour affichage dans l'UI
            app_flask.config["LICENSE_VALID"] = True
            app_flask.config["LICENSE_PLAN"]  = plan
            app_flask.config["LICENSE_EXPIRES"] = expires
            return True
        else:
            reason = result.get("reason", "Licence invalide")
            print(f"[LICENCE] ❌ {reason}")
            delete_license_key()

    app_flask.config["LICENSE_VALID"] = False
    app_flask.config["LICENSE_PLAN"]  = None
    return False
