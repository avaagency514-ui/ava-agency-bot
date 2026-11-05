"""
Telegram Planning & Auto-Posting Bot - Publication de contenu autonome.
Version optimisée pour conteneur Railway / Cloud 24/7.
Support multi-comptes, limitation stricte à 10 posts/jour et anti-spam.
"""
import os
import sys
import json
import re
import random
import requests
import hashlib
import time
from datetime import datetime, timedelta

# Forcer l'encodage et le flush continu pour les logs Railway
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    except Exception:
        pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "telegram_config.json")
PLANNING_FILE = os.path.join(SCRIPT_DIR, "planning.txt")
PHOTO_DIR = os.path.join(SCRIPT_DIR, "media", "photo")
VIDEO_DIR = os.path.join(SCRIPT_DIR, "media", "video")
HISTORY_FILE = os.path.join(SCRIPT_DIR, "telegram_history.json")
MEDIA_HISTORY_FILE = os.path.join(SCRIPT_DIR, "used_media.json")

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[TELEGRAM] Erreur lecture config : {e}", flush=True)
    return {
        "model_name": "Kim 💖",
        "handle": "@kimchle",
        "telegram_link": "https://t.me/kimchle",
        "bot_token": os.getenv("TELEGRAM_PLANNING_BOT_TOKEN", "8884819247:AAFCA1R9JdFW2foeStDketog4hhdFueyOG4"),
        "chat_id": "-1002680107450",
        "planning_file": "planning.txt",
        "photo_dir": "media/photo",
        "video_dir": "media/video",
        "discord_webhook": os.getenv("DISCORD_PLANNING_WEBHOOK", "https://discord.com/api/webhooks/1552356780741501088/5oyZa2qBNC94UBDBc_Ua5Qcv12zjUig4UuvV9ao0RNIDYB9nCEc7jGmp3cjAgXheB233"),
        "max_posts_per_day": 10,
        "min_minutes_between_posts": 25,
        "english_channels": []
    }

def get_accounts(config):
    """
    Retourne la liste des comptes configurés.
    Supporte soit une liste explicite "accounts": [...], soit la config racine directe (rétrocompatibilité).
    """
    raw_accounts = config.get("accounts")
    if isinstance(raw_accounts, list) and len(raw_accounts) > 0:
        return raw_accounts
    # Format simple / compte unique historique
    acc = dict(config)
    acc["id"] = acc.get("id", "kim")
    return [acc]

def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return []

def save_history(history):
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=4)
    except Exception as e:
        print(f"[TELEGRAM] Erreur sauvegarde historique : {e}", flush=True)

def count_posts_today(history, account_id, today_str):
    """
    Compte strictement le nombre de posts réellement envoyés aujourd'hui pour ce compte.
    """
    prefix_new = f"SENT_{account_id}_{today_str}_"
    count = sum(1 for k in history if isinstance(k, str) and k.startswith(prefix_new))
    if count == 0 and account_id in ('kim', 'default', 'kim_💖'):
        # Rétrocompatibilité pour les anciens enregistrements du jour sans préfixe SENT_
        count = sum(1 for k in history if isinstance(k, str) and k.startswith(f"{today_str}_") and not k.startswith("SLOT_"))
    return count

def load_media_history():
    if os.path.exists(MEDIA_HISTORY_FILE):
        try:
            with open(MEDIA_HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[TELEGRAM] Erreur lecture used_media.json : {e}", flush=True)
    return {}

def save_media_history(data):
    try:
        with open(MEDIA_HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        print(f"[TELEGRAM] Erreur sauvegarde used_media.json : {e}", flush=True)

def get_next_photo(target_photo_dir=None, account_id="kim"):
    p_dir = target_photo_dir or PHOTO_DIR
    if not os.path.isabs(p_dir):
        p_dir = os.path.join(SCRIPT_DIR, p_dir)
        
    all_photos = []
    if os.path.exists(p_dir):
        for root, _, files in os.walk(p_dir):
            for f in files:
                if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                    all_photos.append(os.path.join(root, f))
    
    if not all_photos:
        print(f"[TELEGRAM] ⚠️ Aucune photo trouvée dans {p_dir} !", flush=True)
        return None
        
    data = load_media_history()
    # Support format plat legacy ou format multi-comptes
    if 'used_photos' in data and account_id in ('kim', 'default'):
        used_photos = set(data.get('used_photos', []))
    else:
        acc_data = data.get(account_id, {})
        used_photos = set(acc_data.get('photos', []))
        
    available = [p for p in all_photos if os.path.basename(p) not in used_photos]
    
    if not available:
        print(f"[TELEGRAM] 🔄 Toutes les {len(all_photos)} photos ont été publiées pour {account_id} ! Réinitialisation du cycle.", flush=True)
        used_photos = set()
        available = all_photos
        
    chosen = random.choice(available)
    used_photos.add(os.path.basename(chosen))
    
    if 'used_photos' in data and account_id in ('kim', 'default'):
        data['used_photos'] = list(used_photos)
    acc_data = data.setdefault(account_id, {})
    acc_data['photos'] = list(used_photos)
    save_media_history(data)
    
    print(f"[TELEGRAM] 📸 Photo sélectionnée ({account_id}) : {os.path.basename(chosen)} ({len(used_photos)}/{len(all_photos)} utilisées)", flush=True)
    return chosen

def get_next_video(target_video_dir=None, account_id="kim"):
    v_dir = target_video_dir or VIDEO_DIR
    if not os.path.isabs(v_dir):
        v_dir = os.path.join(SCRIPT_DIR, v_dir)
        
    all_videos = []
    if os.path.exists(v_dir):
        for root, _, files in os.walk(v_dir):
            for f in files:
                if f.lower().endswith(('.mp4', '.mov')):
                    all_videos.append(os.path.join(root, f))
                    
    if not all_videos:
        print(f"[TELEGRAM] ⚠️ Aucune vidéo trouvée dans {v_dir} !", flush=True)
        return None
        
    data = load_media_history()
    if 'used_videos' in data and account_id in ('kim', 'default'):
        used_videos = set(data.get('used_videos', []))
    else:
        acc_data = data.get(account_id, {})
        used_videos = set(acc_data.get('videos', []))
        
    available = [v for v in all_videos if os.path.basename(v) not in used_videos]
    
    if not available:
        print(f"[TELEGRAM] 🔄 Toutes les {len(all_videos)} vidéos ont été publiées pour {account_id} ! Réinitialisation du cycle.", flush=True)
        used_videos = set()
        available = all_videos
        
    chosen = random.choice(available)
    used_videos.add(os.path.basename(chosen))
    
    if 'used_videos' in data and account_id in ('kim', 'default'):
        data['used_videos'] = list(used_videos)
    acc_data = data.setdefault(account_id, {})
    acc_data['videos'] = list(used_videos)
    save_media_history(data)
    
    print(f"[TELEGRAM] 🎥 Vidéo sélectionnée ({account_id}) : {os.path.basename(chosen)} ({len(used_videos)}/{len(all_videos)} utilisées)", flush=True)
    return chosen

def parse_planning(file_path):
    if not os.path.exists(file_path):
        print(f"[TELEGRAM] Fichier planning introuvable : {file_path}", flush=True)
        return []
        
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    blocks = re.split(r'\n(?=\[?\d{2}/\d{2}/\d{4} \d{2}:\d{2}\]?)', '\n' + content)
    
    posts = []
    for block in blocks:
        block = block.strip()
        if not block:
            continue
            
        m = re.match(r'\[?(\d{2}/\d{2}/\d{4} \d{2}:\d{2})\]?(.*?):\s*(.*)', block, re.DOTALL)
        if m:
            dt_str, author, msg = m.groups()
            msg = msg.strip()
            
            # Nettoyage pseudo et CTA historique
            msg = msg.replace('@annatavie', '@kimchle')
            msg = msg.replace('❤️ @kimchle', '').strip()
            msg = re.sub(r'\n*💬\s*(?:Viens discuter en privé avec moi|Come chat with me in private)\s*:\s*@kimchle', '', msg, flags=re.IGNORECASE).strip()
            
            has_photo = False
            has_video = False
            
            if re.search(r'\[\s*[Pp]hoto\s*\]', msg):
                has_photo = True
                msg = re.sub(r'\[\s*[Pp]hoto\s*\]', '', msg).strip()
            elif re.search(r'\[\s*[Vv]id[éèe]o\s*\]', msg):
                has_video = True
                msg = re.sub(r'\[\s*[Vv]id[éèe]o\s*\]', '', msg).strip()
                
            msg_lower = msg.lower()
            if not has_photo and not has_video:
                if any(word in msg_lower for word in ['photo', 'image', 'cliché']):
                    has_photo = True
                elif any(word in msg_lower for word in ['vidéo', 'video', 'clip']):
                    has_video = True
                    
            try:
                dt = datetime.strptime(dt_str, "%d/%m/%Y %H:%M")
                posts.append({
                    'time': dt,
                    'time_str': dt_str,
                    'msg': msg,
                    'photo': has_photo,
                    'video': has_video
                })
            except Exception as e:
                pass
                
    return posts

def format_caption(msg, account):
    clean = msg.strip()
    if re.match(r'^https?://\S+$', clean):
        return clean
        
    handle = account.get('handle', '@kimchle').strip()
    handle_formatted = handle if handle.startswith(('@', 'http')) else f"@{handle}"
    
    cta = f"\n\n💬 Viens discuter en privé avec moi : {handle_formatted}"
    return clean + cta

def send_telegram_post(post, account):
    bot_token = account.get('bot_token')
    chat_ids = [c.strip() for c in str(account.get('chat_id', '')).split(',') if c.strip()]
    account_id = account.get('id', 'kim')
    model_name = account.get('model_name', 'Modèle')
    
    if not bot_token or not chat_ids:
        print(f"[TELEGRAM] bot_token ou chat_id manquant pour {model_name} !", flush=True)
        return {'ok': False}
        
    url = f"https://api.telegram.org/bot{bot_token}/"
    msg = post.get('msg', '').strip()
    res = {'ok': False}
    
    photo_dir = account.get('photo_dir') or PHOTO_DIR
    video_dir = account.get('video_dir') or VIDEO_DIR
    
    try:
        is_pure_link = bool(re.match(r'^https?://\S+$', msg))
        
        # 1. Vidéo
        if post.get('video'):
            vid_path = get_next_video(video_dir, account_id)
            if vid_path:
                print(f"[TELEGRAM] -> Envoi Vidéo ({model_name}) : {os.path.basename(vid_path)}", flush=True)
                for c_id in chat_ids:
                    caption = format_caption(msg, account)
                    with open(vid_path, 'rb') as vf:
                        r = requests.post(url + "sendVideo", data={'chat_id': c_id, 'caption': caption}, files={'video': vf}, timeout=120)
                        res = r.json()
                return res
            else:
                post['photo'] = True

        # 2. Photo
        if post.get('photo') or not is_pure_link:
            img_path = get_next_photo(photo_dir, account_id)
            if img_path:
                print(f"[TELEGRAM] -> Envoi Photo ({model_name}) : {os.path.basename(img_path)}", flush=True)
                for c_id in chat_ids:
                    caption = format_caption(msg, account)
                    with open(img_path, 'rb') as imgf:
                        r = requests.post(url + "sendPhoto", data={'chat_id': c_id, 'caption': caption}, files={'photo': imgf}, timeout=60)
                        res = r.json()
                return res

        # 3. Texte simple / Lien pur
        print(f"[TELEGRAM] -> Envoi Texte simple uniquement ({model_name}).", flush=True)
        for c_id in chat_ids:
            caption = format_caption(msg, account)
            r = requests.post(url + "sendMessage", data={'chat_id': c_id, 'text': caption}, timeout=20)
            res = r.json()
        return res
        
    except Exception as e:
        print(f"[TELEGRAM] ERREUR d'envoi API Telegram ({model_name}) : {e}", flush=True)
        return {'ok': False, 'description': str(e)}

def send_discord_notification(post, account, model_name=None, posts_today=None, max_today=10):
    webhook_url = account.get('discord_webhook')
    if not webhook_url:
        return
        
    if post.get('photo'):
        media_tag = "📷 Photo"
    elif post.get('video'):
        media_tag = "🎥 Vidéo"
    else:
        media_tag = "📝 Texte simple"
        
    name = model_name or account.get('model_name', 'Telegram Bot')
    count_str = f" • Post {posts_today}/{max_today} aujourd'hui" if posts_today else ""
    try:
        data = {
            "embeds": [{
                "title": f"✅ Publication Telegram Envoyée ! ({name})",
                "description": f"**Média :** {media_tag}\n\n**Texte :**\n`{post['msg'][:250]}...`",
                "color": 3447003,
                "footer": {"text": f"Antigravity Telegram Bot • {datetime.now().strftime('%H:%M')}{count_str}"}
            }]
        }
        requests.post(webhook_url, json=data, timeout=8)
    except Exception as e:
        pass

def run_planning_cycle(last_sent_times):
    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')
    print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] [PLANNING] Vérification des créneaux...", flush=True)
    
    config = load_config()
    accounts = get_accounts(config)
    history = load_history()
    history_dirty = False
    
    # FENÊTRE STRICTE ANTI-RAFALE : Tolérance de 15 minutes max dans le passé
    limit_past = now - timedelta(minutes=15)
    limit_future = now + timedelta(minutes=2)
    
    for account in accounts:
        account_id = account.get('id') or account.get('model_name', 'default').lower().replace(' ', '_')
        model_name = account.get('model_name', 'Modèle')
        max_posts = int(account.get('max_posts_per_day') or config.get('max_posts_per_day') or 10)
        min_interval = int(account.get('min_minutes_between_posts') or config.get('min_minutes_between_posts') or 25)
        
        # 1. Vérification du quota journalier (MAX 10 posts par jour)
        posts_today = count_posts_today(history, account_id, today_str)
        if posts_today >= max_posts:
            # Quota max journalier atteint
            continue
            
        # 2. Espacement minimum entre deux posts sur ce compte (ex: min 25 minutes)
        if account_id in last_sent_times:
            elapsed = (now - last_sent_times[account_id]).total_seconds() / 60.0
            if elapsed < min_interval:
                # Trop tôt, on attend le prochain cycle
                continue
                
        # 3. Chargement du fichier planning pour ce compte
        planning_path = account.get('planning_file') or PLANNING_FILE
        if not os.path.isabs(planning_path):
            planning_path = os.path.join(SCRIPT_DIR, planning_path)
            
        posts = parse_planning(planning_path)
        if not posts:
            continue
            
        posts.sort(key=lambda p: p['time'])
        
        for post in posts:
            msg_clean = post['msg'].strip()
            msg_hash = hashlib.md5(msg_clean.encode('utf-8')).hexdigest()
            post_key = f"{account_id}_{post['time'].strftime('%Y-%m-%d')}_{msg_hash}"
            slot_key = f"{account_id}_SLOT_{post['time'].strftime('%Y-%m-%d_%H:%M')}"
            legacy_post_key = f"{post['time'].strftime('%Y-%m-%d')}_{msg_hash}"
            legacy_slot_key = f"SLOT_{post['time'].strftime('%Y-%m-%d_%H:%M')}"
            
            already_sent = (
                (post_key in history) or (slot_key in history) or
                (legacy_post_key in history) or (legacy_slot_key in history)
            )
            
            # Post antérieur à la fenêtre de 15 minutes : le marquer comme sauté pour ne jamais l'envoyer en retard
            if post['time'] < limit_past and not already_sent:
                if post['time'].date() == now.date():
                    history.append(slot_key)
                    history_dirty = True
                continue
                
            # Post prévu pile dans la fenêtre actuelle (-15 min à +2 min)
            if limit_past <= post['time'] <= limit_future and not already_sent:
                print(f"[PLANNING] Déclenchement du post {posts_today + 1}/{max_posts} pour {model_name} (prévu à {post['time_str']})...", flush=True)
                res = send_telegram_post(post, account)
                if res and res.get('ok'):
                    print(f"[PLANNING] ✅ Post publié avec succès pour {model_name} !", flush=True)
                    history.append(f"SENT_{account_id}_{today_str}_{int(time.time())}")
                    history.append(post_key)
                    history.append(slot_key)
                    history_dirty = True
                    last_sent_times[account_id] = now
                    posts_today += 1
                    send_discord_notification(post, account, model_name=model_name, posts_today=posts_today, max_today=max_posts)
                else:
                    print(f"[PLANNING] ❌ Échec envoi {model_name} : {res}", flush=True)
                    
                # 1 seul post envoyé par cycle pour ce compte
                break
                
    if history_dirty:
        save_history(history)

def main():
    print("=" * 60, flush=True)
    print(" BOT PLANNING TELEGRAM DEMARRE (RAILWAY CLOUD 24/7) ", flush=True)
    print(" Limite stricte : max 10 posts/jour par canal | Anti-rafale actif ", flush=True)
    print("=" * 60, flush=True)
    
    last_sent_times = {}
    
    while True:
        try:
            run_planning_cycle(last_sent_times)
        except Exception as e:
            print(f"[PLANNING CRITICAL] {e}", flush=True)
            
        time.sleep(300) # Vérifie toutes les 5 minutes

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("[PLANNING] Bot arrêté manuellement.", flush=True)
