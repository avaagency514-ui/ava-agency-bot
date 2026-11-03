"""
Telegram Planning & Auto-Posting Bot - Publication de contenu autonome.
Version optimisée pour conteneur Railway / Cloud 24/7.
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
        "discord_webhook": os.getenv("DISCORD_PLANNING_WEBHOOK", "https://discord.com/api/webhooks/1552356780741501088/5oyZa2qBNC94UBDBc_Ua5Qcv12zjUig4UuvV9ao0RNIDYB9nCEc7jGmp3cjAgXheB233"),
        "english_channels": []
    }

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

def load_media_history():
    if os.path.exists(MEDIA_HISTORY_FILE):
        try:
            with open(MEDIA_HISTORY_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return set(data.get('used_photos', [])), set(data.get('used_videos', []))
        except Exception as e:
            print(f"[TELEGRAM] Erreur lecture used_media.json : {e}", flush=True)
    return set(), set()

def save_media_history(used_photos, used_videos):
    try:
        with open(MEDIA_HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                'used_photos': list(used_photos),
                'used_videos': list(used_videos)
            }, f, indent=4)
    except Exception as e:
        print(f"[TELEGRAM] Erreur sauvegarde used_media.json : {e}", flush=True)

def get_next_photo(target_photo_dir=None):
    p_dir = target_photo_dir or PHOTO_DIR
    all_photos = []
    if os.path.exists(p_dir):
        for root, _, files in os.walk(p_dir):
            for f in files:
                if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                    all_photos.append(os.path.join(root, f))
    
    if not all_photos:
        print(f"[TELEGRAM] ⚠️ Aucune photo trouvée dans {p_dir} !", flush=True)
        return None
        
    used_photos, used_videos = load_media_history()
    available = [p for p in all_photos if os.path.basename(p) not in used_photos]
    
    if not available:
        print(f"[TELEGRAM] 🔄 Toutes les {len(all_photos)} photos ont été publiées ! Réinitialisation du cycle.", flush=True)
        used_photos = set()
        available = all_photos
        
    chosen = random.choice(available)
    used_photos.add(os.path.basename(chosen))
    save_media_history(used_photos, used_videos)
    print(f"[TELEGRAM] 📸 Photo sélectionnée : {os.path.basename(chosen)} ({len(used_photos)}/{len(all_photos)} utilisées)", flush=True)
    return chosen

def get_next_video(target_video_dir=None):
    v_dir = target_video_dir or VIDEO_DIR
    all_videos = []
    if os.path.exists(v_dir):
        for root, _, files in os.walk(v_dir):
            for f in files:
                if f.lower().endswith(('.mp4', '.mov')):
                    all_videos.append(os.path.join(root, f))
                    
    if not all_videos:
        print(f"[TELEGRAM] ⚠️ Aucune vidéo trouvée dans {v_dir} !", flush=True)
        return None
        
    used_photos, used_videos = load_media_history()
    available = [v for v in all_videos if os.path.basename(v) not in used_videos]
    
    if not available:
        print(f"[TELEGRAM] 🔄 Toutes les {len(all_videos)} vidéos ont été publiées ! Réinitialisation du cycle.", flush=True)
        used_videos = set()
        available = all_videos
        
    chosen = random.choice(available)
    used_videos.add(os.path.basename(chosen))
    save_media_history(used_photos, used_videos)
    print(f"[TELEGRAM] 🎥 Vidéo sélectionnée : {os.path.basename(chosen)} ({len(used_videos)}/{len(all_videos)} utilisées)", flush=True)
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

def format_caption(msg, config):
    clean = msg.strip()
    if re.match(r'^https?://\S+$', clean):
        return clean
        
    handle = config.get('handle', '@kimchle').strip()
    handle_formatted = handle if handle.startswith(('@', 'http')) else f"@{handle}"
    
    cta = f"\n\n💬 Viens discuter en privé avec moi : {handle_formatted}"
    return clean + cta

def send_telegram_post(post, config):
    bot_token = config.get('bot_token')
    chat_ids = [c.strip() for c in str(config.get('chat_id', '')).split(',') if c.strip()]
    
    if not bot_token or not chat_ids:
        print("[TELEGRAM] bot_token ou chat_id manquant !", flush=True)
        return {'ok': False}
        
    url = f"https://api.telegram.org/bot{bot_token}/"
    msg = post.get('msg', '').strip()
    res = {'ok': False}
    
    try:
        is_pure_link = bool(re.match(r'^https?://\S+$', msg))
        
        # 1. Vidéo
        if post.get('video'):
            vid_path = get_next_video()
            if vid_path:
                print(f"[TELEGRAM] -> Envoi Vidéo : {os.path.basename(vid_path)}", flush=True)
                for c_id in chat_ids:
                    caption = format_caption(msg, config)
                    with open(vid_path, 'rb') as vf:
                        r = requests.post(url + "sendVideo", data={'chat_id': c_id, 'caption': caption}, files={'video': vf}, timeout=120)
                        res = r.json()
                return res
            else:
                post['photo'] = True

        # 2. Photo
        if post.get('photo') or not is_pure_link:
            img_path = get_next_photo()
            if img_path:
                print(f"[TELEGRAM] -> Envoi Photo : {os.path.basename(img_path)}", flush=True)
                for c_id in chat_ids:
                    caption = format_caption(msg, config)
                    with open(img_path, 'rb') as imgf:
                        r = requests.post(url + "sendPhoto", data={'chat_id': c_id, 'caption': caption}, files={'photo': imgf}, timeout=60)
                        res = r.json()
                return res

        # 3. Texte simple / Lien pur
        print("[TELEGRAM] -> Envoi Texte simple uniquement.", flush=True)
        for c_id in chat_ids:
            caption = format_caption(msg, config)
            r = requests.post(url + "sendMessage", data={'chat_id': c_id, 'text': caption}, timeout=20)
            res = r.json()
        return res
        
    except Exception as e:
        print(f"[TELEGRAM] ERREUR d'envoi API Telegram : {e}", flush=True)
        return {'ok': False, 'description': str(e)}

def send_discord_notification(post, config):
    webhook_url = config.get('discord_webhook')
    if not webhook_url:
        return
        
    if post.get('photo'):
        media_tag = "📷 Photo"
    elif post.get('video'):
        media_tag = "🎥 Vidéo"
    else:
        media_tag = "📝 Texte simple"
        
    try:
        data = {
            "embeds": [{
                "title": "✅ Publication Telegram Envoyée !",
                "description": f"**Média :** {media_tag}\n\n**Texte :**\n`{post['msg'][:250]}...`",
                "color": 3447003,
                "footer": {"text": f"Antigravity Telegram Bot • {datetime.now().strftime('%H:%M')}"}
            }]
        }
        requests.post(webhook_url, json=data, timeout=8)
    except Exception as e:
        pass

def run_planning_cycle():
    now = datetime.now()
    print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] [PLANNING] Vérification des créneaux...", flush=True)
    
    config = load_config()
    planning_path = config.get('planning_file') or PLANNING_FILE
    if not os.path.exists(planning_path):
        planning_path = PLANNING_FILE
        
    posts = parse_planning(planning_path)
    if not posts:
        print("[PLANNING] Aucun post trouvé dans le fichier planning.", flush=True)
        return
        
    history = load_history()
    posts_sent = 0
    posts.sort(key=lambda p: p['time'])
    
    for post in posts:
        msg_clean = post['msg'].strip()
        msg_hash = hashlib.md5(msg_clean.encode('utf-8')).hexdigest()
        post_key = f"{post['time'].strftime('%Y-%m-%d')}_{msg_hash}"
        slot_key = f"SLOT_{post['time'].strftime('%Y-%m-%d_%H:%M')}"
        
        limit_past = now - timedelta(hours=2)
        already_sent = (post_key in history) or (slot_key in history)
        
        # Si le créneau est arrivé (dans les 2 dernières heures max et pas encore envoyé)
        if limit_past <= post['time'] <= now and not already_sent:
            print(f"[PLANNING] Déclenchement du post prévu pour {post['time_str']}...", flush=True)
            res = send_telegram_post(post, config)
            if res and res.get('ok'):
                print(f"[PLANNING] ✅ Post publié avec succès !", flush=True)
                history.append(post_key)
                history.append(slot_key)
                save_history(history)
                posts_sent += 1
                send_discord_notification(post, config)
            else:
                print(f"[PLANNING] ❌ Échec envoi : {res}", flush=True)
                
            if posts_sent >= 2:
                print("[PLANNING] Limite de sécurité de 2 envois consécutifs atteinte.", flush=True)
                break
                
    print(f"[PLANNING] Fin du cycle. {posts_sent} post(s) envoyé(s).", flush=True)

def main():
    print("=" * 55, flush=True)
    print(" BOT PLANNING TELEGRAM DEMARRE (RAILWAY CLOUD 24/7) ", flush=True)
    print("=" * 55, flush=True)
    
    while True:
        try:
            run_planning_cycle()
        except Exception as e:
            print(f"[PLANNING CRITICAL] {e}", flush=True)
            
        time.sleep(300) # Vérifie toutes les 5 minutes

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("[PLANNING] Bot arrêté manuellement.", flush=True)
