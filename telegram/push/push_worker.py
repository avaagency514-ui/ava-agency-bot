"""
Telegram Mass DM / Push Worker - Envoi de messages privés en masse aux fans de Kim.
Compatible Pyrogram, conteneur Railway / Cloud 24/7.
"""
import asyncio
import os
import sys
import json
import random
import time
import argparse
import sqlite3
from datetime import datetime, timedelta, timezone

# Forcer l'encodage et le flush continu pour les logs Railway et Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    except Exception:
        pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "push_config.json")
SESSION_FILE = os.path.join(SCRIPT_DIR, "session_push")
STATUS_FILE = os.path.join(SCRIPT_DIR, "push_status.json")
CANCEL_FLAG_FILE = os.path.join(SCRIPT_DIR, "push_cancel.flag")


def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[PUSH] Erreur lecture config : {e}", flush=True)
    return {}

CONFIG = load_config()

API_ID = int(os.getenv("TELEGRAM_API_ID", os.getenv("API_ID", CONFIG.get("api_id", 36121361))))
API_HASH = str(os.getenv("TELEGRAM_API_HASH", os.getenv("API_HASH", CONFIG.get("api_hash", "29263ae8f125a5dfb91491b63264d0e2"))))
FALLBACK_API_ID = int(CONFIG.get("fallback_api_id", 33266483))
FALLBACK_API_HASH = str(CONFIG.get("fallback_api_hash", "0d2d60888604dc3b15bed3e65efc6ce8"))

def write_status(data):
    try:
        data["updated_at"] = int(time.time())
        with open(STATUS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[PUSH] Erreur écriture status: {e}", flush=True)

def read_status():
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {"status": "idle"}

def is_cancelled():
    return os.path.exists(CANCEL_FLAG_FILE)

def clear_cancel_flag():
    if os.path.exists(CANCEL_FLAG_FILE):
        try:
            os.remove(CANCEL_FLAG_FILE)
        except Exception:
            pass

def set_cancel_flag():
    try:
        with open(CANCEL_FLAG_FILE, 'w', encoding='utf-8') as f:
            f.write("CANCEL")
    except Exception:
        pass

def get_peers_from_sqlite():
    """Récupère la liste de secours des user peers depuis la base SQLite de la session."""
    user_ids = []
    db_path = SESSION_FILE + ".session"
    if not os.path.exists(db_path):
        return user_ids
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT id FROM peers WHERE type = 'user' AND id > 0")
        rows = cur.fetchall()
        user_ids = [r[0] for r in rows]
        conn.close()
    except Exception as e:
        print(f"[PUSH] Erreur lecture peers SQLite: {e}", flush=True)
    return user_ids

async def create_client():
    """Tente de créer un client Pyrogram avec credentials primaires, sinon fallback."""
    from pyrogram import Client
    client = Client(SESSION_FILE, api_id=API_ID, api_hash=API_HASH)
    try:
        await client.connect()
        return client
    except Exception as e:
        print(f"[PUSH] Connexion avec API_ID={API_ID} échouée ({e}), tentative avec fallback...", flush=True)
        try:
            client_fallback = Client(SESSION_FILE, api_id=FALLBACK_API_ID, api_hash=FALLBACK_API_HASH)
            await client_fallback.connect()
            return client_fallback
        except Exception as e2:
            print(f"[PUSH] Échec critique connexion Pyrogram: {e2}", flush=True)
            raise e2

async def fetch_target_fans(client, exclude_hours=2):
    """
    Récupère tous les fans ayant une conversation privée avec Kim.
    Exclut optionnellement les fans actifs récemment.
    """
    from pyrogram.enums import ChatType
    targets = []
    excluded_count = 0
    now = datetime.now(timezone.utc)
    seen_ids = set()

    print("[PUSH] Récupération des conversations privées en cours...", flush=True)
    try:
        async for dialog in client.get_dialogs():
            chat = dialog.chat
            if chat.type in [ChatType.PRIVATE, "private"]:
                user_id = chat.id
                if user_id in seen_ids:
                    continue
                seen_ids.add(user_id)

                # Vérification de l'exclusion des fans actifs récemment
                if exclude_hours > 0 and dialog.top_message and dialog.top_message.date:
                    msg_date = dialog.top_message.date
                    if msg_date.tzinfo is None:
                        msg_date = msg_date.replace(tzinfo=timezone.utc)
                    diff_hours = (now - msg_date).total_seconds() / 3600.0
                    if diff_hours < exclude_hours:
                        excluded_count += 1
                        continue

                first_name = chat.first_name or "Fan"
                username = f"@{chat.username}" if chat.username else ""
                targets.append({
                    "id": user_id,
                    "name": first_name,
                    "username": username
                })
    except Exception as e:
        print(f"[PUSH] Avertissement lors de get_dialogs: {e}", flush=True)

    # Compléter avec les peers SQLite connus si non encore vus
    sqlite_peers = get_peers_from_sqlite()
    for peer_id in sqlite_peers:
        if peer_id not in seen_ids:
            seen_ids.add(peer_id)
            targets.append({
                "id": peer_id,
                "name": f"Fan_{peer_id}",
                "username": ""
            })

    print(f"[PUSH] Cibles identifiées : {len(targets)} fans (Exclus car actifs < {exclude_hours}h : {excluded_count})", flush=True)
    return targets, excluded_count

async def get_stats():
    """Action stats: retourne les métriques pour Discord."""
    client = None
    try:
        client = await create_client()
        me = await client.get_me()
        targets, excluded = await fetch_target_fans(client, exclude_hours=CONFIG.get("exclude_active_hours", 2))
        res = {
            "model_name": f"{me.first_name} (@{me.username or 'kimchle'})",
            "model_id": me.id,
            "total_reachable_fans": len(targets) + excluded,
            "ready_fans": len(targets),
            "excluded_active_fans": excluded,
            "sqlite_cached_peers": len(get_peers_from_sqlite())
        }
        print(json.dumps(res, ensure_ascii=False))
        return res
    except Exception as e:
        err_res = {
            "error": str(e),
            "model_name": "Kim 💖 (@kimchle)",
            "total_reachable_fans": len(get_peers_from_sqlite()),
            "ready_fans": len(get_peers_from_sqlite()),
            "excluded_active_fans": 0,
            "sqlite_cached_peers": len(get_peers_from_sqlite())
        }
        print(json.dumps(err_res, ensure_ascii=False))
        return err_res
    finally:
        if client:
            try:
                await client.disconnect()
            except Exception:
                pass

async def send_single_push(client, user_id, text, media_path=None):
    """Envoie le message ou le média au fan donné."""
    if media_path and os.path.exists(media_path):
        ext = os.path.splitext(media_path)[1].lower()
        caption = text if len(text) <= 1024 else None

        if ext in ['.jpg', '.jpeg', '.png', '.webp']:
            await client.send_photo(chat_id=user_id, photo=media_path, caption=caption)
        elif ext in ['.mp4', '.mov', '.avi']:
            await client.send_video(chat_id=user_id, video=media_path, caption=caption)
        elif ext in ['.ogg', '.mp3', '.m4a']:
            await client.send_voice(chat_id=user_id, voice=media_path, caption=caption)
        else:
            await client.send_document(chat_id=user_id, document=media_path, caption=caption)

        # Si le texte était trop long pour la légende (limite 1024 chars), envoyer en second message
        if text and len(text) > 1024:
            await client.send_message(chat_id=user_id, text=text)
    else:
        await client.send_message(chat_id=user_id, text=text)

async def run_push(job_id, text, media_path=None, exclude_hours=2, delay_min=2.5, delay_max=4.5):
    """Exécute l'envoi en masse aux fans."""
    from pyrogram.errors import (
        FloodWait, UserPrivacyRestricted, PeerIdInvalid, PeerFlood,
        UserDeactivated, UserIsBlocked, RPCError
    )
    clear_cancel_flag()
    status_data = {
        "job_id": job_id,
        "status": "running",
        "started_at": int(time.time()),
        "text_preview": (text[:100] + "...") if len(text) > 100 else text,
        "has_media": bool(media_path and os.path.exists(media_path)),
        "media_name": os.path.basename(media_path) if media_path else None,
        "total": 0,
        "sent": 0,
        "skipped": 0,
        "failed": 0,
        "percent": 0.0,
        "current_recipient": None,
        "error": None
    }
    write_status(status_data)

    client = None
    try:
        client = await create_client()
        me = await client.get_me()
        print(f"[PUSH] Connecté avec succès : {me.first_name} (@{me.username})", flush=True)

        targets, excluded = await fetch_target_fans(client, exclude_hours=exclude_hours)
        total_targets = len(targets)
        status_data["total"] = total_targets
        status_data["excluded_count"] = excluded
        write_status(status_data)

        if total_targets == 0:
            print("[PUSH] Aucun fan éligible trouvé pour ce push.", flush=True)
            status_data["status"] = "completed"
            status_data["percent"] = 100.0
            write_status(status_data)
            return

        sent_count = 0
        skipped_count = 0
        failed_count = 0

        for i, target in enumerate(targets):
            # Vérifier l'annulation
            if is_cancelled():
                print(f"[PUSH] Annulation demandée par le chatter. Arrêt au destinataire {i}/{total_targets}.", flush=True)
                status_data["status"] = "cancelled"
                write_status(status_data)
                break

            user_id = target["id"]
            name = target["name"]
            status_data["current_recipient"] = f"{name} ({user_id})"
            status_data["percent"] = round((i / total_targets) * 100, 1)
            write_status(status_data)

            success = False
            retries = 0

            while retries < 2 and not success:
                try:
                    await send_single_push(client, user_id, text, media_path)
                    sent_count += 1
                    status_data["sent"] = sent_count
                    success = True
                    print(f"[PUSH] [{i+1}/{total_targets}] OK Envoyé à {name} ({user_id})", flush=True)
                except FloodWait as fw:
                    wait_sec = int(fw.value) + 2
                    print(f"[PUSH] ⚠️ FloodWait Telegram détecté: pause de {wait_sec} secondes...", flush=True)
                    status_data["status"] = "paused_floodwait"
                    status_data["pause_duration"] = wait_sec
                    write_status(status_data)
                    await asyncio.sleep(wait_sec)
                    status_data["status"] = "running"
                    write_status(status_data)
                    retries += 1
                except (UserPrivacyRestricted, UserDeactivated, UserIsBlocked, PeerIdInvalid) as skip_err:
                    print(f"[PUSH] [{i+1}/{total_targets}] Ignoré ({type(skip_err).__name__}) pour {name} ({user_id})", flush=True)
                    skipped_count += 1
                    status_data["skipped"] = skipped_count
                    success = True # Ne pas retry
                except PeerFlood:
                    print(f"[PUSH] ⚠️ PeerFlood Telegram sur {name}. Pause de courtoisie de 3 minutes...", flush=True)
                    status_data["status"] = "paused_flood"
                    write_status(status_data)
                    await asyncio.sleep(180)
                    status_data["status"] = "running"
                    write_status(status_data)
                    retries += 1
                except Exception as send_err:
                    print(f"[PUSH] [{i+1}/{total_targets}] ❌ Erreur pour {name} ({user_id}): {send_err}", flush=True)
                    failed_count += 1
                    status_data["failed"] = failed_count
                    success = True

            # Écrire l'état toutes les 5 messages ou à la fin
            if (i + 1) % 5 == 0 or (i + 1) == total_targets:
                status_data["percent"] = round(((i + 1) / total_targets) * 100, 1)
                write_status(status_data)

            # Pause aléatoire pour paraître 100% humain et indétectable
            delay = random.uniform(delay_min, delay_max)
            await asyncio.sleep(delay)

        if not is_cancelled():
            status_data["status"] = "completed"
            status_data["percent"] = 100.0
            status_data["completed_at"] = int(time.time())
            print(f"[PUSH] ✅ Mass DM terminé avec succès ! Total: {sent_count} envoyés, {skipped_count} ignorés, {failed_count} erreurs.", flush=True)
            write_status(status_data)

    except Exception as fatal_err:
        print(f"[PUSH] ❌ Erreur fatale push worker: {fatal_err}", flush=True)
        status_data["status"] = "failed"
        status_data["error"] = str(fatal_err)
        write_status(status_data)
    finally:
        if client:
            try:
                await client.disconnect()
            except Exception:
                pass

def main():
    parser = argparse.ArgumentParser(description="Telegram Push Worker (Mass DM)")
    parser.add_argument("--action", choices=["stats", "send", "cancel", "status"], default="status")
    parser.add_argument("--job-id", type=str, default="")
    parser.add_argument("--text", type=str, default="")
    parser.add_argument("--media", type=str, default="")
    parser.add_argument("--exclude-hours", type=float, default=2.0)
    parser.add_argument("--delay-min", type=float, default=2.5)
    parser.add_argument("--delay-max", type=float, default=4.5)

    args = parser.parse_args()

    if args.action == "cancel":
        set_cancel_flag()
        cur_status = read_status()
        cur_status["status"] = "cancelling"
        write_status(cur_status)
        print("[PUSH] Signal d'annulation transmis.")
        return

    if args.action == "status":
        print(json.dumps(read_status(), indent=2, ensure_ascii=False))
        return

    if args.action == "stats":
        asyncio.run(get_stats())
        return

    if args.action == "send":
        if not args.text and not args.media:
            print("[PUSH] Erreur: Un texte ou un média est requis pour l'envoi.")
            sys.exit(1)
        job_id = args.job_id or f"push_{int(time.time())}"
        asyncio.run(run_push(
            job_id=job_id,
            text=args.text,
            media_path=args.media if args.media else None,
            exclude_hours=args.exclude_hours,
            delay_min=args.delay_min,
            delay_max=args.delay_max
        ))

if __name__ == "__main__":
    main()
