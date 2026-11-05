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
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", "data"))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "push_config.json")
SESSION_FILE = os.path.join(SCRIPT_DIR, "session_push")
STATUS_FILE = os.path.join(SCRIPT_DIR, "push_status.json")
CANCEL_FLAG_FILE = os.path.join(SCRIPT_DIR, "push_cancel.flag")

HISTORY_FILE_DATA = os.path.join(DATA_DIR, "push_history.json")
HISTORY_FILE_LOCAL = os.path.join(SCRIPT_DIR, "push_history.json")
DELETE_QUEUE_DATA = os.path.join(DATA_DIR, "auto_delete_queue.json")
DELETE_QUEUE_LOCAL = os.path.join(SCRIPT_DIR, "auto_delete_queue.json")

def load_channel_subscribers():
    """Charge les IDs des abonnés actuels au canal Telegram VIP."""
    paths = [
        os.path.join(DATA_DIR, "known_members.json"),
        os.path.join(SCRIPT_DIR, "..", "welcome", "known_members.json"),
        os.path.join(DATA_DIR, "known_members_fr.json")
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        return set(int(x) for x in data)
                    elif isinstance(data, dict):
                        return set(int(x) for x in data.keys())
            except Exception:
                pass
    return set()

def load_delete_queue():
    for fpath in [DELETE_QUEUE_DATA, DELETE_QUEUE_LOCAL]:
        if os.path.exists(fpath):
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
    return []

def save_delete_queue(queue):
    for fpath in [DELETE_QUEUE_DATA, DELETE_QUEUE_LOCAL]:
        try:
            os.makedirs(os.path.dirname(fpath), exist_ok=True)
            with open(fpath, 'w', encoding='utf-8') as f:
                json.dump(queue, f, indent=2)
        except Exception as e:
            print(f"[PUSH] Erreur sauvegarde auto_delete_queue {fpath}: {e}", flush=True)

def record_auto_delete(chat_id, msg_id, hours):
    if hours <= 0:
        return
    queue = load_delete_queue()
    delete_at = int(time.time() + hours * 3600)
    queue.append({
        "chat_id": int(chat_id),
        "msg_id": int(msg_id),
        "delete_at": delete_at
    })
    save_delete_queue(queue)

async def process_auto_delete_queue(client):
    """Vérifie et supprime les messages de push expirés."""
    queue = load_delete_queue()
    if not queue:
        return
    now_ts = int(time.time())
    remaining = []
    deleted_count = 0
    for item in queue:
        if now_ts >= item.get("delete_at", 0):
            try:
                await client.delete_messages(chat_id=item["chat_id"], message_ids=item["msg_id"])
                deleted_count += 1
            except Exception as e:
                print(f"[PUSH] Erreur auto-suppression msg {item.get('msg_id')} pour {item.get('chat_id')}: {e}", flush=True)
        else:
            remaining.append(item)
    if deleted_count > 0 or len(remaining) != len(queue):
        save_delete_queue(remaining)
        print(f"[PUSH] Auto-suppression terminée : {deleted_count} message(s) supprimé(s).", flush=True)

try:
    from zoneinfo import ZoneInfo
    PARIS_TZ = ZoneInfo("Europe/Paris")
except Exception:
    PARIS_TZ = timezone(timedelta(hours=1))

def get_today_str():
    return datetime.now(PARIS_TZ).strftime("%Y-%m-%d")

def load_history():
    for fpath in [HISTORY_FILE_DATA, HISTORY_FILE_LOCAL]:
        if os.path.exists(fpath):
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
    return {}

def save_history(history):
    # Conserver les 30 derniers jours d'historique
    cutoff_date = (datetime.now(PARIS_TZ) - timedelta(days=30)).strftime("%Y-%m-%d")
    trimmed = {d: uids for d, uids in history.items() if d >= cutoff_date}
    for fpath in [HISTORY_FILE_DATA, HISTORY_FILE_LOCAL]:
        try:
            os.makedirs(os.path.dirname(fpath), exist_ok=True)
            with open(fpath, 'w', encoding='utf-8') as f:
                json.dump(trimmed, f, indent=2)
        except Exception as e:
            print(f"[PUSH] Erreur sauvegarde historique {fpath}: {e}", flush=True)

def get_sent_today_fans():
    history = load_history()
    today_str = get_today_str()
    day_data = history.get(today_str, [])
    if isinstance(day_data, dict):
        return set(int(uid) for uid in day_data.keys())
    elif isinstance(day_data, list):
        return set(int(uid) for uid in day_data)
    return set()

def record_fan_push_sent(user_id):
    history = load_history()
    today_str = get_today_str()
    if today_str not in history or not isinstance(history[today_str], list):
        history[today_str] = []
    uid_int = int(user_id)
    if uid_int not in history[today_str]:
        history[today_str].append(uid_int)
    save_history(history)


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
        # CRUCIAL : Pyrogram connect() ne peuple PAS client.me par défaut !
        # send_message() vérifie self.me.is_premium, donc client.me DOIT être assigné.
        client.me = await client.get_me()
        return client
    except Exception as e:
        print(f"[PUSH] Connexion avec API_ID={API_ID} échouée ({e}), tentative avec fallback...", flush=True)
        try:
            client_fallback = Client(SESSION_FILE, api_id=FALLBACK_API_ID, api_hash=FALLBACK_API_HASH)
            await client_fallback.connect()
            client_fallback.me = await client_fallback.get_me()
            return client_fallback
        except Exception as e2:
            print(f"[PUSH] Échec critique connexion Pyrogram: {e2}", flush=True)
            raise e2

async def fetch_target_fans(client, exclude_hours=2, target_segment="all"):
    """
    Récupère les fans ciblés selon le segment (all, subscribers, interested, churned).
    Exclut STRICTEMENT les fans ayant déjà reçu un push aujourd'hui (1 push max par fan par jour).
    Exclut optionnellement les fans actifs récemment.
    """
    from pyrogram.enums import ChatType
    targets = []
    excluded_active_count = 0
    excluded_already_sent_today = 0
    sent_today = get_sent_today_fans()
    subscribers_set = load_channel_subscribers()
    now = datetime.now(timezone.utc)
    seen_ids = set()

    print(f"[PUSH] Cible demandée : {target_segment.upper()} | Abonnés VIP : {len(subscribers_set)} | Exclus aujourd'hui : {len(sent_today)}", flush=True)
    print("[PUSH] Récupération des conversations privées en cours...", flush=True)
    try:
        async for dialog in client.get_dialogs():
            if not dialog or not getattr(dialog, 'chat', None):
                continue
            chat = dialog.chat
            chat_type = getattr(chat, 'type', None)
            if chat_type in [ChatType.PRIVATE, "private"] or str(chat_type).endswith(".PRIVATE"):
                user_id = getattr(chat, 'id', None)
                if not user_id or user_id in seen_ids:
                    continue
                seen_ids.add(user_id)

                # RÈGLE D'OR: Ne jamais envoyer 2 push à la même personne le même jour
                if user_id in sent_today:
                    excluded_already_sent_today += 1
                    continue

                # Filtrage selon le segment
                if target_segment == "subscribers" and user_id not in subscribers_set:
                    continue
                elif target_segment == "churned" and user_id in subscribers_set:
                    continue

                # Vérification de l'exclusion des fans actifs récemment
                if exclude_hours > 0 and dialog.top_message and dialog.top_message.date:
                    msg_date = dialog.top_message.date
                    if msg_date.tzinfo is None:
                        msg_date = msg_date.replace(tzinfo=timezone.utc)
                    diff_hours = (now - msg_date).total_seconds() / 3600.0
                    if diff_hours < exclude_hours:
                        excluded_active_count += 1
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

    # Compléter avec les peers SQLite connus si le segment l'autorise
    if target_segment in ["all", "subscribers", "churned"]:
        sqlite_peers = get_peers_from_sqlite()
        for peer_id in sqlite_peers:
            if peer_id not in seen_ids:
                seen_ids.add(peer_id)
                if peer_id in sent_today:
                    excluded_already_sent_today += 1
                    continue
                if target_segment == "subscribers" and peer_id not in subscribers_set:
                    continue
                if target_segment == "churned" and peer_id in subscribers_set:
                    continue
                targets.append({
                    "id": peer_id,
                    "name": f"Fan_{peer_id}",
                    "username": ""
                })

    print(f"[PUSH] Cibles retenues ({target_segment}) : {len(targets)} fans | Déjà contactés aujourd'hui : {excluded_already_sent_today} | Actifs < {exclude_hours}h : {excluded_active_count}", flush=True)
    return targets, excluded_active_count, excluded_already_sent_today

async def get_stats():
    """Action stats: retourne les métriques pour Discord."""
    client = None
    try:
        client = await create_client()
        me = await client.get_me()
        targets, excluded_active, excluded_today = await fetch_target_fans(client, exclude_hours=CONFIG.get("exclude_active_hours", 2))
        res = {
            "model_name": f"{me.first_name} (@{me.username or 'kimchle'})",
            "model_id": me.id,
            "total_reachable_fans": len(targets) + excluded_active + excluded_today,
            "ready_fans": len(targets),
            "excluded_active_fans": excluded_active,
            "already_sent_today": excluded_today,
            "sqlite_cached_peers": len(get_peers_from_sqlite())
        }
        print(json.dumps(res, ensure_ascii=False))
        return res
    except Exception as e:
        sent_today = get_sent_today_fans()
        cached = get_peers_from_sqlite()
        err_res = {
            "error": str(e),
            "model_name": "Kim 💖 (@kimchle)",
            "total_reachable_fans": len(cached),
            "ready_fans": max(0, len(cached) - len(sent_today)),
            "excluded_active_fans": 0,
            "already_sent_today": len(sent_today),
            "sqlite_cached_peers": len(cached)
        }
        print(json.dumps(err_res, ensure_ascii=False))
        return err_res
    finally:
        if client:
            try:
                await client.disconnect()
            except Exception:
                pass

def prepare_audio_voice(file_path):
    """Si c'est un fichier audio non-ogg (ex: mp3, m4a, wav), convertit en ogg/opus pour un vrai vocal Telegram."""
    if not file_path or not os.path.exists(file_path):
        return file_path
    ext = os.path.splitext(file_path)[1].lower()
    if ext in ['.mp3', '.wav', '.m4a', '.aac', '.flac']:
        ogg_path = os.path.splitext(file_path)[0] + "_voice.ogg"
        try:
            import subprocess
            cmd = ["ffmpeg", "-y", "-i", file_path, "-c:a", "libopus", "-b:a", "32k", "-vn", ogg_path]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
            if res.returncode == 0 and os.path.exists(ogg_path):
                print(f"[PUSH] Fichier audio converti en vocal Telegram OGG Opus : {os.path.basename(ogg_path)}", flush=True)
                return ogg_path
        except Exception as e:
            print(f"[PUSH] Conversion ffmpeg audio ignorée ({e})", flush=True)
    return file_path

async def send_single_push(client, user_id, text, media_path=None):
    """Envoie le message ou le média (photo, vidéo, vocal) au fan donné et retourne le message envoyé."""
    msg = None
    if media_path and os.path.exists(media_path):
        ext = os.path.splitext(media_path)[1].lower()
        caption = text if text and len(text) <= 1024 else None

        # 1. Photos
        if ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.heic']:
            msg = await client.send_photo(chat_id=user_id, photo=media_path, caption=caption)

        # 2. Vidéos
        elif ext in ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v']:
            msg = await client.send_video(chat_id=user_id, video=media_path, caption=caption, supports_streaming=True)

        # 3. Message Vocal / Audio
        elif ext in ['.ogg', '.opus']:
            msg = await client.send_voice(chat_id=user_id, voice=media_path, caption=caption)
        elif ext in ['.mp3', '.wav', '.m4a', '.aac', '.flac']:
            try:
                msg = await client.send_voice(chat_id=user_id, voice=media_path, caption=caption)
            except Exception:
                msg = await client.send_audio(chat_id=user_id, audio=media_path, caption=caption)

        # 4. Autres documents
        else:
            msg = await client.send_document(chat_id=user_id, document=media_path, caption=caption)

        # Si le texte était trop long pour la légende (> 1024 chars), envoyer en second message
        if text and len(text) > 1024:
            await client.send_message(chat_id=user_id, text=text)
    else:
        msg = await client.send_message(chat_id=user_id, text=text)
    return msg

async def run_push(job_id, text, media_path=None, exclude_hours=2, delay_min=58.0, delay_max=62.0, target_segment="all", auto_delete_hours=0.0):
    """Exécute l'envoi en masse aux fans (cadence sécurisée: ~60s entre chaque message)."""
    from pyrogram.errors import (
        FloodWait, UserPrivacyRestricted, PeerIdInvalid, PeerFlood,
        UserDeactivated, UserIsBlocked, RPCError
    )
    clear_cancel_flag()

    # Pré-optimisation de l'audio si nécessaire
    if media_path and os.path.exists(media_path):
        media_path = prepare_audio_voice(media_path)
    status_data = {
        "job_id": job_id,
        "status": "running",
        "started_at": int(time.time()),
        "text_preview": (text[:100] + "...") if len(text) > 100 else text,
        "has_media": bool(media_path and os.path.exists(media_path)),
        "media_name": os.path.basename(media_path) if media_path else None,
        "target_segment": target_segment,
        "auto_delete_hours": auto_delete_hours,
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
        if not getattr(client, "me", None):
            client.me = await client.get_me()
        me = client.me
        print(f"[PUSH] Connecté avec succès : {me.first_name} (@{me.username})", flush=True)

        # Vérification et traitement de la file d'auto-suppression
        await process_auto_delete_queue(client)

        targets, excluded_active, excluded_today = await fetch_target_fans(client, exclude_hours=exclude_hours, target_segment=target_segment)
        total_targets = len(targets)
        status_data["total"] = total_targets
        status_data["excluded_active"] = excluded_active
        status_data["excluded_already_sent_today"] = excluded_today
        write_status(status_data)

        if total_targets == 0:
            msg = f"[PUSH] Aucun fan à contacter pour le segment '{target_segment}' : {excluded_today} fans déjà contactés aujourd'hui (1 max/jour)."
            print(msg, flush=True)
            status_data["status"] = "completed"
            status_data["percent"] = 100.0
            status_data["message"] = msg
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
                    sent_msg = await send_single_push(client, user_id, text, media_path)
                    sent_count += 1
                    status_data["sent"] = sent_count
                    record_fan_push_sent(user_id)
                    if auto_delete_hours > 0 and sent_msg and hasattr(sent_msg, 'id'):
                        record_auto_delete(user_id, sent_msg.id, auto_delete_hours)
                    success = True
                    print(f"[PUSH] [{i+1}/{total_targets}] OK Envoyé à {name} ({user_id})", flush=True)
                except FloodWait as fw:
                    wait_sec = int(fw.value) + 2
                    print(f"[PUSH] ⚠️ FloodWait Telegram détecté: pause de {wait_sec} secondes...", flush=True)
                    status_data["status"] = "paused_floodwait"
                    status_data["pause_duration"] = wait_sec
                    status_data["pause_until"] = int(time.time()) + wait_sec
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
                    status_data["pause_duration"] = 180
                    status_data["pause_until"] = int(time.time()) + 180
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

            # Écrire l'état après chaque message pour mise à jour continue sur Discord (cadence 60s)
            status_data["percent"] = round(((i + 1) / total_targets) * 100, 1)
            status_data["delay_seconds"] = 60
            status_data["estimated_remaining_seconds"] = (total_targets - (i + 1)) * 60
            write_status(status_data)

            # Pause d'environ 60 secondes (58 à 62s) pour paraître 100% humain et indétectable
            delay = random.uniform(delay_min, delay_max)
            await asyncio.sleep(delay)

        if not is_cancelled():
            status_data["status"] = "completed"
            status_data["percent"] = 100.0
            status_data["completed_at"] = int(time.time())
            print(f"[PUSH] ✅ Mass DM terminé avec succès ! Total: {sent_count} envoyés, {skipped_count} ignorés, {failed_count} erreurs.", flush=True)
            write_status(status_data)

        # Nettoyage auto-suppression
        await process_auto_delete_queue(client)

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
    parser.add_argument("--action", choices=["stats", "send", "cancel", "status", "purge_expired"], default="status")
    parser.add_argument("--job-id", type=str, default="")
    parser.add_argument("--text", type=str, default="")
    parser.add_argument("--media", type=str, default="")
    parser.add_argument("--exclude-hours", type=float, default=2.0)
    parser.add_argument("--delay-min", type=float, default=58.0)
    parser.add_argument("--delay-max", type=float, default=62.0)
    parser.add_argument("--target-segment", type=str, default="all")
    parser.add_argument("--auto-delete-hours", type=float, default=0.0)

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

    if args.action == "purge_expired":
        async def _purge():
            c = await create_client()
            await process_auto_delete_queue(c)
            await c.disconnect()
        asyncio.run(_purge())
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
            delay_max=args.delay_max,
            target_segment=args.target_segment,
            auto_delete_hours=args.auto_delete_hours
        ))

if __name__ == "__main__":
    main()
