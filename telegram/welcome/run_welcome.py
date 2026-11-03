"""
Telegram Welcome Bot - Détecte les nouveaux abonnés et envoie vocal/texte.
Version optimisée pour conteneur Railway / Cloud 24/7.
"""
import asyncio
import os
import json
import sys
import random
import glob
import logging
import time
from datetime import datetime
from pyrogram import Client
from pyrogram.errors import FloodWait, UserPrivacyRestricted, PeerIdInvalid, PeerFlood, RPCError

# Forcer l'encodage et le flush continu pour les logs Railway
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    except Exception:
        pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "welcome_config.json")
SESSION_FILE = os.path.join(SCRIPT_DIR, "session_bienvenue")
KNOWN_MEMBERS_FILE = os.path.join(SCRIPT_DIR, "known_members.json")
LOG_FILE = os.path.join(SCRIPT_DIR, "welcome.log")
VOICES_DIR_FR = os.path.join(SCRIPT_DIR, "welcome_voices")
VOICES_DIR_EN = os.path.join(SCRIPT_DIR, "welcome_voices_en")

# Configuration des logs
logger = logging.getLogger("WelcomeBot")
logger.setLevel(logging.INFO)
formatter = logging.Formatter("[%(asctime)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

logger.handlers.clear()
try:
    file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
except Exception:
    pass

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"[WELCOME] Erreur lecture config : {e}")
    return {}

config = load_config()
API_ID = int(config.get("api_id", 33266483))
API_HASH = str(config.get("api_hash", "0d2d60888604dc3b15bed3e65efc6ce8"))
CHANNELS = [int(c) for c in config.get("channels", [-1002680107450]) if c]
ENGLISH_CHANNELS = [int(c) for c in config.get("en_channels", []) if c]

CHECK_INTERVAL = 45         # Scan toutes les 45 secondes
MAX_WELCOMES_PER_CYCLE = 1  # 1 seul envoi par cycle pour un rythme 100% humain et indétectable
DELAY_BETWEEN_MESSAGES = 15 # 15 secondes entre messages
PEER_FLOOD_PAUSE_UNTIL = 0

MESSAGES_BIENVENUE_FR = [
    """Coucou toi, bienvenue dans mon univers privé 😈💦 Prépare-toi à une expérience ultra immersive et pleine de sensations fortes...

Mais avant qu'on commence, dis-moi : quel est ton prénom et tu viens d'où ? ✨""",

    """Hey ! Trop contente de te voir ici 💖 Je te réserve du contenu exclusif et des surprises sans filtre comme tu aimes...

Dis-moi un peu, comment tu t'appelles et quelle heure il est chez toi ? 💋""",

    """Hello mon grand, bienvenue chez moi 🔥 Ici c'est 100% plaisir et tentation, je vais bien m'occuper de toi...

Dis-moi vite ton petit prénom et d'où tu m'écris ! 😈"""
]

MESSAGES_BIENVENUE_EN = [
    """Hey handsome, welcome to my private universe 😈💦 Get ready for an intense immersive experience full of thrills...

Before we get started, tell me: what's your name and where are you from? ✨""",

    """Hey babe! So happy to see you here 💖 I've got plenty of exclusive content and unfiltered surprises waiting for you...

Tell me, what's your name and what time is it where you are? 💋""",

    """Hello sweetie, welcome to my secret world 🔥 It's all about pure pleasure and temptation here, I'll take good care of you...

Quick, tell me your name and where are you texting me from! 😈"""
]

INDEX_VOICE_FR = 0
INDEX_VOICE_EN = 0
INDEX_TEXT_FR = 0
INDEX_TEXT_EN = 0
INDEX_PATTERN = 0

ROTATION_PATTERN = ["VOICE", "TEXT", "VOICE", "TEXT", "VOICE", "TEXT", "VOICE", "VOICE"]

def get_next_welcome_content(is_english=False):
    global INDEX_VOICE_FR, INDEX_VOICE_EN, INDEX_TEXT_FR, INDEX_TEXT_EN, INDEX_PATTERN
    
    target_dir = VOICES_DIR_EN if is_english else VOICES_DIR_FR
    ogg_files = sorted(glob.glob(os.path.join(target_dir, '*.ogg'))) if os.path.exists(target_dir) else []
    texts = MESSAGES_BIENVENUE_EN if is_english else MESSAGES_BIENVENUE_FR
    
    mode = ROTATION_PATTERN[INDEX_PATTERN % len(ROTATION_PATTERN)]
    INDEX_PATTERN = (INDEX_PATTERN + 1) % len(ROTATION_PATTERN)
    
    if mode == "VOICE" and ogg_files:
        if is_english:
            voice = ogg_files[INDEX_VOICE_EN % len(ogg_files)]
            INDEX_VOICE_EN = (INDEX_VOICE_EN + 1) % len(ogg_files)
        else:
            voice = ogg_files[INDEX_VOICE_FR % len(ogg_files)]
            INDEX_VOICE_FR = (INDEX_VOICE_FR + 1) % len(ogg_files)
        return {"type": "voice", "path": voice}
    else:
        if is_english:
            txt = texts[INDEX_TEXT_EN % len(texts)]
            INDEX_TEXT_EN = (INDEX_TEXT_EN + 1) % len(texts)
        else:
            txt = texts[INDEX_TEXT_FR % len(texts)]
            INDEX_TEXT_FR = (INDEX_TEXT_FR + 1) % len(texts)
        return {"type": "text", "text": txt}

def load_known_members():
    if os.path.exists(KNOWN_MEMBERS_FILE):
        try:
            with open(KNOWN_MEMBERS_FILE, 'r', encoding='utf-8') as f:
                return set(json.load(f))
        except Exception as e:
            logger.error(f"[WELCOME] Erreur lecture known_members: {e}")
    return set()

def save_known_members(members):
    try:
        with open(KNOWN_MEMBERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(list(members), f)
    except Exception as e:
        logger.error(f"[WELCOME] Erreur sauvegarde known_members: {e}")

async def get_current_members(client, channel_id):
    members = set()
    try:
        async def _fetch():
            async for member in client.get_chat_members(channel_id):
                if member.user:
                    members.add(member.user.id)
        await asyncio.wait_for(_fetch(), timeout=30)
    except asyncio.TimeoutError:
        logger.warning(f"[WELCOME] Timeout lors de la récupération des membres pour {channel_id}")
    except Exception as e:
        logger.error(f"[WELCOME] Erreur récupération membres pour {channel_id} : {e}")
    return members

async def send_welcome(client, user_id, channel_id):
    global PEER_FLOOD_PAUSE_UNTIL
    is_english = (channel_id in ENGLISH_CHANNELS)
    lang_tag = "EN" if is_english else "FR"
    
    try:
        content = get_next_welcome_content(is_english=is_english)
        
        if content["type"] == "voice" and os.path.exists(content.get("path", "")):
            voice_file = content["path"]
            try:
                await asyncio.wait_for(client.send_voice(user_id, voice_file), timeout=25)
                logger.info(f"[WELCOME] [{lang_tag}] OK Message VOCAL (rotation 5 vocaux) '{os.path.basename(voice_file)}' envoyé à {user_id} !")
                return "SUCCESS"
            except Exception as e_voice:
                logger.warning(f"[WELCOME] [{lang_tag}] Envoi vocal échoué ({e_voice}), repli sur TEXTE...")
                texts = MESSAGES_BIENVENUE_EN if is_english else MESSAGES_BIENVENUE_FR
                fallback_txt = random.choice(texts)
                await asyncio.wait_for(client.send_message(user_id, fallback_txt), timeout=15)
                logger.info(f"[WELCOME] [{lang_tag}] OK Message TEXTE (repli) envoyé à {user_id} !")
                return "SUCCESS"
        else:
            text_msg = content["text"]
            await asyncio.wait_for(client.send_message(user_id, text_msg), timeout=15)
            logger.info(f"[WELCOME] [{lang_tag}] OK Message TEXTE (rotation 3 textes) envoyé à {user_id} !")
            return "SUCCESS"

    except UserPrivacyRestricted:
        logger.warning(f"[WELCOME] ATTENTION {user_id} a bloqué les DMs (confidentialité). Skipped.")
        return "SKIP"
    except PeerIdInvalid:
        logger.warning(f"[WELCOME] ATTENTION {user_id} inaccessible/invalide. Skipped.")
        return "SKIP"
    except PeerFlood:
        logger.warning(f"[WELCOME] Telegram PEER_FLOOD sur {user_id}. Pause de courtoisie de 3 minutes...")
        PEER_FLOOD_PAUSE_UNTIL = time.time() + 180
        return "FLOOD"
    except FloodWait as e:
        wait_s = min(e.value, 180)
        logger.warning(f"[WELCOME] FloodWait Telegram détecté : {wait_s}s...")
        await asyncio.sleep(wait_s)
        return "SUCCESS"
    except Exception as e:
        logger.error(f"[WELCOME] ERREUR envoi à {user_id} : {e}")
        return "SKIP"

async def main():
    logger.info("=" * 55)
    logger.info(" BOT DE BIENVENUE TELEGRAM DEMARRE (RAILWAY CLOUD 24/7) ")
    logger.info("=" * 55)
    
    while True:
        try:
            async with Client(SESSION_FILE, api_id=API_ID, api_hash=API_HASH) as client:
                me = await client.get_me()
                logger.info(f"[WELCOME] Connecté en tant que : {me.first_name} (@{me.username or 'sans_username'}, ID: {me.id})")
                
                known = load_known_members()
                
                if not known:
                    logger.info("[WELCOME] Premier démarrage : scan initial des membres...")
                    for chan in CHANNELS:
                        chan_members = await get_current_members(client, chan)
                        known.update(chan_members)
                    save_known_members(known)
                    logger.info(f"[WELCOME] {len(known)} membres existants enregistrés. Surveillance active !")
                else:
                    logger.info(f"[WELCOME] {len(known)} membres connus en base. Surveillance active !")
                
                while True:
                    await asyncio.sleep(CHECK_INTERVAL)
                    
                    if time.time() < PEER_FLOOD_PAUSE_UNTIL:
                        mins_left = int((PEER_FLOOD_PAUSE_UNTIL - time.time()) / 60) + 1
                        logger.info(f"[WELCOME] [PAUSE] En pause de securite anti-flood (reprise dans ~{mins_left} min)...")
                        continue
                    
                    for chan in CHANNELS:
                        current = await get_current_members(client, chan)
                        if not current:
                            continue
                            
                        new_members = list(current - known)
                        if new_members:
                            logger.info(f"[WELCOME] {len(new_members)} nouvel abonné détecté dans {chan}...")
                            
                            batch = new_members[:MAX_WELCOMES_PER_CYCLE]
                            for user_id in batch:
                                result = await send_welcome(client, user_id, chan)
                                known.add(user_id)
                                save_known_members(known)
                                
                                if result == "FLOOD":
                                    logger.warning(f"[WELCOME] Arrêt du lot suite à restriction Telegram anti-flood.")
                                    break
                                    
                                await asyncio.sleep(DELAY_BETWEEN_MESSAGES)

        except Exception as e:
            logger.error(f"[WELCOME CRASH/RECONNECT] Déconnexion ou erreur : {e}. Reconnexion dans 15 secondes...")
            await asyncio.sleep(15)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("[WELCOME] Bot arrêté manuellement.")
    except Exception as e:
        logger.critical(f"[WELCOME FATAL] {e}")
