import os
import time
import random
import string
import requests
import json
from ldplayer_manager import LDPlayerManager
from smspool_manager import SMSPoolManager

# --- CONSTANTES ---
STEP_DELAY = 3




def prepare_media(kit):
    import subprocess, json
    log("=== PRÉPARATION DES MÉDIAS (via Node.js Content Factory) ===")
    profile_id = kit.get('profile_id', 'id_test')
    market = kit.get('market', 'US')
    
    try:
        log(f"Appel de farm_bridge_media.js pour {profile_id} ({market})...")
        result = subprocess.run(
            ["node", "farm_bridge_media.js", profile_id, market],
            capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=os.getcwd()
        )
        for line in result.stdout.split('\\n'):
            if line.startswith('JSON_OUTPUT:'):
                data = json.loads(line.replace('JSON_OUTPUT:', ''))
                if data['status'] == 'success':
                    log("Médias téléchargés et processés par MultiMetaChanger avec succès !")
                else:
                    log(f"Erreur Node: {data.get('message')}")
        if result.stderr:
            log(f"Stderr: {result.stderr}")
    except Exception as e:
        log(f"Erreur d'appel Node.js: {e}")

def wait(seconds, message=""):
    if message:
        print(f"[{time.strftime('%H:%M:%S')}] >>> Pause {seconds}s {message}")
    time.sleep(seconds)

def human_pause():
    wait(random.uniform(2.0, 4.0))

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")

def breakpoint(d, step_name):
    # Mode automatisé : Capture d'écran silencieuse, aucune pause
    filename = f"step_{step_name}.jpg"
    try:
        d.screenshot(filename)
        log(f"[CHECKPOINT] {step_name} -> {filename}")
    except:
        pass

def get_farm_kit():
    import subprocess, json
    log("=== RECUPERATION AUTOMATIQUE DU KIT (Content Factory) ===")
    
    try:
        result = subprocess.run(
            ["node", "farm_bridge_get_kit.js", "US"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=os.getcwd(), timeout=120
        )
        for line in result.stdout.split('\n'):
            if line.startswith('JSON_OUTPUT:'):
                data = json.loads(line.replace('JSON_OUTPUT:', ''))
                if data.get('status') == 'success':
                    log(f"Kit recupere -> Profile: {data['profile_id']} | Pseudo: {data['pseudo']}")
                    # Parse pseudo - peut contenir "pseudo : hannah.coal | nom : hannah"
                    raw_pseudo = data['pseudo']
                    # Extraire la valeur après "pseudo :" ou "pseudo:" si présent
                    if 'pseudo' in raw_pseudo.lower() and ':' in raw_pseudo:
                        raw_pseudo = raw_pseudo.split(':', 1)[1]
                    # Ne garder que la partie avant "|"
                    if '|' in raw_pseudo:
                        raw_pseudo = raw_pseudo.split('|')[0]
                    pseudo = raw_pseudo.strip().lower().replace(' ', '.')
                    
                    return {
                        "pseudo": pseudo,
                        "profile_id": data['profile_id'],
                        "bio": data.get('bio', 'Juste moi'),
                        "password": "".join(random.choices(string.ascii_letters + string.digits, k=10)) + "A1!",
                        "market": data.get('market', 'US'),
                        "follows": ["michel_sarran", "gordonramsay", "jeanimbert"]
                    }
                else:
                    log(f"Erreur Content Factory : {data.get('message')}")
                    return None
        if result.stderr:
            log(f"[Node stderr] {result.stderr[:500]}")
        log("Pas de reponse JSON valide du bridge.")
        return None
    except Exception as e:
        log(f"Erreur critique get_farm_kit: {e}")
        return None





def dismiss_popups(d):
    """Ferme toutes les publicités et popups parasites de LDPlayer au démarrage."""
    log("Vérification des popups/pubs LDPlayer...")
    
    for attempt in range(5):
        dismissed = False
        
        # Pub LDPlayer - croix X en haut à droite (position fixe ~405, 315 sur 454x800)
        # On clique directement sur la position connue du X
        if d(resourceId="android:id/button1").exists(timeout=2):
            d(resourceId="android:id/button1").click()
            dismissed = True
        
        # Gérer le crash Android (App Not Responding / System UI)
        if d(text="L'interface ne répond pas.").exists(timeout=1) or d(textContains="ne répond pas").exists(timeout=1):
            log("Popup Android ANR détecté, on clique sur 'Attendre'...")
            if d(text="Attendre").exists():
                d(text="Attendre").click()
                dismissed = True
                wait(5)
            elif d(text="Wait").exists():
                d(text="Wait").click()
                dismissed = True
                wait(5)

        # Bouton "Fermer" ou "Close" générique
        for close_text in ["Fermer", "Close", "×", "✕", "X", "CLOSE", "SKIP", "Ignorer"]:
            if d(text=close_text).exists(timeout=1):
                d(text=close_text).click()
                dismissed = True
                break
        
        # Chercher une ImageButton (souvent le X des pubs)
        if d(className="android.widget.ImageButton").exists(timeout=1):
            # Vérifier si c'est en haut à droite (prob. un X de fermeture)
            btn = d(className="android.widget.ImageButton")
            info = btn.info
            if info and info.get('bounds'):
                bounds = info['bounds']
                cx = (bounds['left'] + bounds['right']) / 2
                cy = (bounds['top'] + bounds['bottom']) / 2
                # Si le bouton est dans le coin supérieur droit
                screen_info = d.info
                width = screen_info.get('displayWidth', 1080)
                height = screen_info.get('displayHeight', 1920)
                if cx > width * 0.6 and cy < height * 0.4:
                    btn.click()
                    dismissed = True
        
        # Clic direct sur la position connue du X des pubs LDPlayer (coin haut-droite)
        # Sur la capture : X est à environ x=405, y=315 sur un écran 454x800
        # En proportionnel : 0.89, 0.39
        try:
            # On dump l'écran pour chercher le mot "Download" qui trahit une pub
            xml = d.dump_hierarchy()
            if 'Download' in xml or 'download' in xml.lower():
                log("Pub détectée (Download button visible) - fermeture par clic en haut à droite")
                d.click(0.89, 0.39)
                wait(2)
                dismissed = True
        except:
            pass
        
        if dismissed:
            log(f"Popup fermé (tentative {attempt+1})")
            wait(2)
        else:
            break  # Plus de popup à fermer
    
    log("Vérification popups terminée.")

def connect_proton_vpn(d):
    log("=== ÉTAPE 1 : PROTON VPN ===")
    d.app_start("ch.protonvpn.android", use_monkey=True)
    wait(12, "(chargement Proton VPN)")
    
    # Gérer ANR au lancement du VPN
    if d(textContains="ne répond pas").exists(timeout=2):
        if d(text="Attendre").exists():
            d(text="Attendre").click()
        elif d(text="Wait").exists():
            d(text="Wait").click()
        wait(5)
    
    # Gérer le tuto "J'ai compris" (Widget Proton VPN)
    if d(text="J'ai compris").exists(timeout=15):
        log("Popup 'J'ai compris' détecté. Clic...")
        d(text="J'ai compris").click()
        wait(5)

    # Vérifier si déjà connecté
    if d(textContains="Connecté").exists(timeout=5) or d(textContains="Connected").exists(timeout=3):
        log("[+] VPN déjà connecté !")
        return True
    
    log("Recherche du bouton 'Se connecter'...")
    # Essai 1 : bouton via resourceId
    if d(resourceId="ch.protonvpn.android:id/connection_button").exists(timeout=5):
        d(resourceId="ch.protonvpn.android:id/connection_button").click()
        wait(10, "(connexion VPN en cours...)")
        try:
            if d(textContains="Connecté").exists(timeout=10) or d(textContains="Connected").exists(timeout=5):
                log("[+] VPN connecté !")
                return True
        except Exception as e:
            log(f"Reconnexion ATX post-VPN 1... ({e})")
            wait(5)
            
    # Essai 2 : Bouton texte "Connexion rapide"
    try:
        if d(text="Connexion rapide").exists(timeout=3):
            d(text="Connexion rapide").click()
            wait(10, "(connexion VPN en cours...)")
            if d(textContains="Connecté").exists(timeout=10):
                log("[+] VPN connecté !")
                return True
    except Exception as e:
        log(f"Reconnexion ATX post-VPN 2... ({e})")
        wait(5)
    
    # Essai 3 : clic au centre-bas de l'écran (bouton power du VPN)
    log("Tentative clic centre-bas pour activer VPN...")
    d.click(0.5, 0.7)
    wait(10, "(connexion VPN en cours...)")
    
    try:
        if d(textContains="Connecté").exists(timeout=10) or d(textContains="Connected").exists(timeout=5):
            log("[+] VPN connecté via clic !")
            return True
    except Exception as e:
        log(f"[!] L'activation du VPN a temporairement coupé la connexion ATX ({e}).")
        log("Attente de la reconnexion automatique du pont ADB...")
        wait(5)
        try:
            # Réveil du daemon
            d.shell("echo ping")
        except:
            pass
    
    log("[!] VPN : connexion incertaine - on continue quand même pour ne pas bloquer.")
    return True  # On continue même si on n'est pas sûr

def create_instagram_account(d, kit):
    log("=== ÉTAPE 2 : INSTAGRAM ===")
    d.app_start("com.instagram.android")
    wait(8, "(chargement Instagram)")
    
    # 1. Écran d'accueil Instagram
    
    # Le VPN peut parfois faire planter le service d'accessibilité d'Android.
    # On force une réinitialisation de UIAutomator pour être sûr d'avoir un écran à jour.
    try:
        log("Réinitialisation du pont UIAutomator post-VPN...")
        d.reset_uiautomator()
        wait(3)
    except:
        pass
        
    # Attendre que l'écran charge vraiment
    wait(5)
    
    # Cliquer sur "Démarrer" (nouvel écran d'accueil Instagram)
    # On utilise textContains avec "marrer" pour éviter les bugs d'encodage sur le "é"
    if d(textContains="marrer").exists(timeout=10) or d(textContains="Démarrer").exists():
        log("Bouton 'Démarrer' détecté. Clic...")
        if d(textContains="marrer").exists():
            d(textContains="marrer").click()
        else:
            d(textContains="Démarrer").click()
        wait(5)
    elif d(textContains="started").exists(timeout=5):
        log("Bouton 'Get started' détecté. Clic...")
        d(textContains="started").click()
        wait(5)
    
    # Ensuite chercher "Créer un compte" / "Créer un nouveau compte"
    for txt in ["Créer un nouveau compte", "nouveau compte", "Créer un compte", "Create new account"]:
        if d(textContains=txt).exists(timeout=5):
            log(f"Bouton '{txt}' trouvé. Clic...")
            d(textContains=txt).click()
            break
    else:
        log("Pas de bouton de création trouvé. Tentative de clic par coordonnées (bas de l'écran)...")
        # Fallback par coordonnées si le bouton est là mais illisible par uiautomator
        # Sur la capture, "Démarrer" est un gros bouton bleu vers le bas de l'écran (y=0.75)
        d.click(0.5, 0.75)
        wait(3)
        # Et "Créer un nouveau compte" est souvent un bouton en bas
        d.click(0.5, 0.85)
        wait(3)
        log("L'app est peut-être déjà sur l'écran de saisie, on continue.")
    
    wait(STEP_DELAY)
    
    # --- NUMÉRO ET SMS ---
    sp = SMSPoolManager()
    
    if d(textContains="Aucun de ces comptes").exists() or d(textContains="None of the above").exists():
        if d(text="Aucun de ces comptes").exists(): d(text="Aucun de ces comptes").click()
        else: d(text="None of the above").click()
        wait(2)

    numero_info = sp.order_instagram_us()
    if not numero_info.get("success"):
        log("Erreur d'achat de numéro SMSPool.")
        return False
        
    num = str(numero_info["number"]).replace("+", "")
    if num.startswith("1") and len(num) == 11: num = num[1:]

    if d(className="android.widget.EditText").exists(timeout=10):
        d(className="android.widget.EditText").click()
        wait(1)
        for _ in range(15): d.press("delete")
        d(className="android.widget.EditText").set_text(num)
        wait(2)
        if d(text="Suivant").exists(): d(text="Suivant").click()
        elif d(text="Next").exists(): d(text="Next").click()
    
    wait(STEP_DELAY)
    
    for retry in range(3):
        breakpoint(d, f"05_attente_sms_essai_{retry}")
        
        # Attente SMS
        sms_code = sp.check_sms(numero_info["order_id"], timeout=120)
        if sms_code:
            log(f"Code SMS reçu : {sms_code}")
            if d(className="android.widget.EditText").exists(timeout=10):
                d(className="android.widget.EditText").set_text(sms_code)
                wait(2)
                if d(text="Suivant").exists(): d(text="Suivant").click()
                elif d(text="Next").exists(): d(text="Next").click()
            wait(STEP_DELAY)
            breakpoint(d, "06_apres_code_valide")
            break
        else:
            log(f"Pas de SMS reçu (Essai {retry+1}/3). On demande à renvoyer le code...")
            if retry < 2:
                # Clic pour renvoyer le code au même numéro
                if d(textContains="pas reçu").exists():
                    d(textContains="pas reçu").click()
                elif d(textContains="receive").exists():
                    d(textContains="receive").click()
                wait(3)
                
                # Clic "Renvoyer le SMS"
                if d(textContains="Renvoyer").exists():
                    d(textContains="Renvoyer").click()
                elif d(textContains="Resend").exists():
                    d(textContains="Resend").click()
                wait(5)
                # NE SURTOUT PAS ANNULER LA COMMANDE NI CHANGER LE NUMERO
            else:
                log("Échec définitif SMS après 3 tentatives.")
                try:
                    sp.cancel_order(numero_info["order_id"])
                except:
                    pass
                return False
        
        
    # --- MOT DE PASSE ---
    log("Écran Mot de passe...")
    if d(className="android.widget.EditText").wait(timeout=15):
        human_pause()
        d(className="android.widget.EditText").set_text(kit['password'])
        human_pause()
        if d(text="Suivant").exists():
            d(text="Suivant").click()
    
    wait(STEP_DELAY, "(chargement écran suivant)")
    breakpoint(d, "07_apres_pass")
    
    # --- DATE DE NAISSANCE ---
    if d(textContains="naissance").exists(timeout=10) or d(textContains="birthday").exists():
        log("Écran Date de naissance détecté. Ciblage : 20-23 ans...")
        
        # Si le popup n'est pas ouvert, on clique sur le champ de date
        if not d(textContains="FINIR").exists() and not d(textContains="finir").exists():
            d.click(0.5, 0.5)
            wait(2)
            
        swipes = random.randint(7, 10)
        for _ in range(swipes):
            # Swipe vers le bas (drag de haut en bas) sur la 3ème colonne (Année)
            # x=0.75, de y=0.45 (haut) vers y=0.65 (bas)
            d.swipe(0.75, 0.45, 0.75, 0.65, duration=0.2)
            wait(0.5)
            
        human_pause()
        breakpoint(d, "08_date_saisie")
        
        # Clic sur "DÉFINIR" ou "Définir" ou "SET"
        for btn_text in ["DÉFINIR", "Définir", "DEFINIR", "Set", "SET"]:
            if d(text=btn_text).exists():
                d(text=btn_text).click()
                wait(2)
                break
        else:
            # Fallback clic approximatif sur le bouton en bas à droite du popup
            d.click(0.7, 0.7)
            wait(2)
            
        human_pause()
        if d(text="Suivant").exists(): d(text="Suivant").click()
        elif d(text="Next").exists(): d(text="Next").click()
        wait(STEP_DELAY, "(validation date naissance)")
        breakpoint(d, "09_apres_date")

    # --- NOM COMPLET ---
    if d(textContains="appelez-vous").exists(timeout=10) or d(textContains="Nom complet").exists():
        log("Écran Nom complet détecté.")
        human_pause()
        d(className="android.widget.EditText").set_text(kit['pseudo'])
        human_pause()
        if d(text="Suivant").exists():
            d(text="Suivant").click()
        wait(STEP_DELAY, "(validation nom complet)")
        breakpoint(d, "10_apres_nom")

    # --- CHOIX DU PSEUDO ---
    if d(textContains="nom de profil").exists(timeout=10) or d(textContains="username").exists():
        log("Écran de choix du pseudo détecté.")
        pseudo_field = d(className="android.widget.EditText")
        if pseudo_field.exists():
            human_pause()
            pseudo_field.clear_text()
            pseudo_field.set_text(kit['pseudo'])
            wait(5, "(vérification disponibilité pseudo)")
            breakpoint(d, "11_pseudo_saisi")
            
            if d(text="Suivant").exists():
                d(text="Suivant").click()
            else:
                log("Pseudo indisponible, ajout d'une lettre aléatoire...")
                lettre = random.choice(string.ascii_lowercase)
                nouveau_pseudo = f"{kit['pseudo']}{lettre}"
                pseudo_field.set_text(nouveau_pseudo)
                kit['pseudo'] = nouveau_pseudo 
                log(f"Nouveau pseudo enregistré : {kit['pseudo']}")
                
                wait(5)
                breakpoint(d, "11_pseudo_saisi_fallback")
                if d(text="Suivant").exists(): d(text="Suivant").click()
                
            wait(STEP_DELAY, "(validation pseudo)")

    # --- CONDITIONS GÉNÉRALES ---
    if d(textContains="Conditions").exists(timeout=15) or d(text="J’accepte").exists() or d(text="J'accepte").exists():
        log("Écran Conditions Générales détecté.")
        human_pause()
        breakpoint(d, "12_conditions_generales")
        if d(text="J’accepte").exists():
            d(text="J’accepte").click()
        elif d(text="J'accepte").exists():
            d(text="J'accepte").click()
        wait(35, "(création du compte en cours sur les serveurs...)")

    # --- CONTACTS (REFUS STRICT) ---
    if d(textContains="contacts").exists(timeout=15) or d(text="REFUSER").exists():
        log("Écran / Popup d'importation des contacts détecté. REFUS STRICT.")
        human_pause()
        breakpoint(d, "13_contacts")
        if d(text="REFUSER").exists():
            d(text="REFUSER").click()
        elif d(text="Ignorer").exists():
            d(text="Ignorer").click()
        wait(5)

    # --- IGNORER LES ÉTAPES ONBOARDING ---
    log("Passage des écrans d'onboarding (Photo, Email, Suggestions)...")
    for etape_onboarding in range(4):
        human_pause()
        if d(text="Ignorer").exists(timeout=5):
            log(f"Bouton 'Ignorer' détecté (écran {etape_onboarding+1}/4). Clic.")
            d(text="Ignorer").click()
            wait(3)
            if d(text="Ignorer").exists(timeout=2):
                d(text="Ignorer").click()
                wait(3)

    breakpoint(d, "14_compte_cree")
    log(f"Compte de base créé avec succès pour {kit['pseudo']} !")
    return True

def setup_instagram_profile(d, kit):
    log("=== ÉTAPE 3 : CONFIGURATION DU PROFIL ===")
    wait(5)
    
    # Popup 'Balayez l'écran' (Accueil)
    if d(text="OK").exists(timeout=5):
        d(text="OK").click()
        wait(2)
        
    # --- PHOTO DE PROFIL ---
    log("Navigation vers le profil...")
    if d(descriptionContains="Profil").exists():
        d(descriptionContains="Profil").click()
    else:
        d.click(0.9, 0.95)
    wait(5)
    
    if d(text="Modifier le profil").exists():
        d(text="Modifier le profil").click()
        wait(5)
        if d(textContains="Modifier la photo").exists():
            d(textContains="Modifier la photo").click()
            wait(3)
            if d(textContains="Nouvelle photo").exists():
                d(textContains="Nouvelle photo").click()
                wait(3)
                
                # POPUP PERMISSION PHOTOS
                if d(text="AUTORISER").exists():
                    log("Autorisation de l'accès aux photos...")
                    d(text="AUTORISER").click()
                    wait(3)
                
                log("Sélection de la photo de profil...")
                d.click(0.2, 0.6) # Clique sur la 1ère photo
                wait(2)
                # Suivant (bleu en haut)
                if d(description="Suivant").exists(): d(description="Suivant").click()
                elif d(resourceIdMatches=".*next.*").exists(): d(resourceIdMatches=".*next.*").click()
                wait(2)
                if d(description="Suivant").exists(): d(description="Suivant").click()
                elif d(resourceIdMatches=".*next.*").exists(): d(resourceIdMatches=".*next.*").click()
                wait(10, "(upload de la PP)")

        # --- BIO ---
        log("Ajout de la Bio...")
        if d(text="Bio").exists():
            d(text="Bio").click()
            wait(2)
            bio_field = d(className="android.widget.EditText")
            if bio_field.exists():
                bio_field.set_text(kit.get('bio', 'Bio automatique'))
                wait(2)
                d.click(0.9, 0.08) # Valider (check en haut à droite)
                wait(3)
        # Retour au profil
        d.press("back")
        wait(3)
    
    # --- FOLLOWS CIBLÉS & ADVANCED WARM-UP ---
    log("=== ÉTAPE 4 : FOLLOWS & ADVANCED WARM-UP ===")
    if d(description="Accueil").exists(): d(description="Accueil").click()
    wait(3)
    
    for i, target in enumerate(kit.get('follows', [])):
        log(f"Recherche et Follow de : {target}")
        if d(descriptionContains="Recherche").exists():
            d(descriptionContains="Recherche").click()
            wait(3)
            if d(text="Rechercher").exists():
                d(text="Rechercher").click()
                wait(2)
                d(className="android.widget.EditText").set_text(target)
                wait(5, "(chargement résultats)")
                
                if d(text=target).exists(): d(text=target).click()
                else: d.click(0.5, 0.2)
                wait(10, "(chargement profil)")
                
                if d(text="Suivre").exists():
                    d(text="Suivre").click()
                    wait(2)
                
                # WARM-UP SUR LE PREMIER PROFIL SEULEMENT
                if i == 0:
                    log("Exécution du Warm-up avancé sur ce profil...")
                    if d(descriptionContains="Reels").exists() or d(descriptionContains="reels").exists():
                        d(descriptionContains="Reels").click()
                        wait(5)
                        log("Ouverture du premier Reel...")
                        d.click(0.16, 0.65) # 1er reel dans la grille
                        wait(10, "(visionnage du Reel)")
                        
                        log("Like du Reel (Double tap)")
                        d.double_click(0.5, 0.5)
                        wait(3)
                        
                        log("Ouverture des options (3 petits points)...")
                        if d(descriptionContains="options").exists(): d(descriptionContains="options").click()
                        else: d.click(0.9, 0.9)
                        wait(3)
                        
                        if d(textContains="intéresse").exists():
                            d(textContains="intéresse").click()
                            log("Marqué comme 'Ça m'intéresse' !")
                        wait(3)
                        d.press("back")
                        wait(2)
                
                d.press("back")
                wait(2)
                d.press("back")
                wait(2)

    # --- ACTIVATION 2FA ---
    
    # --- UPLOAD REEL ---
    log("=== ÉTAPE 4.5 : PUBLICATION DU REEL ===")
    breakpoint(d, "15_avant_reel")
    if d(description="Accueil").exists(): d(description="Accueil").click()
    wait(3)
    if d(descriptionContains="Créer").exists() or d(descriptionContains="Nouvelle publication").exists():
        if d(descriptionContains="Créer").exists(): d(descriptionContains="Créer").click()
        else: d(descriptionContains="Nouvelle publication").click()
    else:
        d.click(0.5, 0.95)
    wait(5)
    
    if d(text="Reel").exists(): d(text="Reel").click(); wait(3)
    
    breakpoint(d, "16_choix_video_reel")
    log("Sélection de la vidéo...")
    d.click(0.16, 0.3) # Clic dans la grille
    wait(3)
    if d(text="Suivant").exists(): d(text="Suivant").click()
    elif d(description="Suivant").exists(): d(description="Suivant").click()
    wait(3)
    
    breakpoint(d, "17_edition_reel")
    if d(text="Suivant").exists(): d(text="Suivant").click()
    wait(3)
    
    if d(textContains="légende").exists() or d(className="android.widget.EditText").exists():
        d(className="android.widget.EditText").set_text(kit.get('bio', 'Nouvelle vidéo !'))
        wait(2)
        
    breakpoint(d, "18_avant_partager_reel")
    if d(text="Partager").exists():
        d(text="Partager").click()
        log("Reel en cours de publication...")
        wait(10)

    # --- UPLOAD STORY CTA ---
    log("=== ÉTAPE 4.6 : PUBLICATION DE LA STORY ===")
    if d(description="Accueil").exists(): d(description="Accueil").click()
    wait(3)
    
    # Swipe droite pour la caméra
    d.swipe(0.1, 0.5, 0.9, 0.5)
    wait(5)
    breakpoint(d, "19_camera_story")
    
    # Ouvrir la galerie (en bas à gauche)
    d.click(0.1, 0.9)
    wait(3)
    breakpoint(d, "20_choix_photo_story")
    
    d.click(0.5, 0.3) # Sélection 2ème photo
    wait(3)
    
    breakpoint(d, "21_avant_sticker")
    if d(descriptionContains="Autocollants").exists(): d(descriptionContains="Autocollants").click()
    else: d.click(0.7, 0.1)
    wait(3)
    
    if d(text="Lien").exists(): d(text="Lien").click()
    else:
        d(className="android.widget.EditText").set_text("Lien")
        wait(2); d.click(0.5, 0.3)
    wait(3)
    
    
    import re
    clean_pseudo = re.sub(r'[^a-zA-Z0-9]', '', kit['pseudo'])
    tracking_link = f"https://linky.fans/{clean_pseudo}"
    url_field = d(className="android.widget.EditText")
    if url_field.exists():
        url_field.set_text(tracking_link)

        wait(2)
        if d(text="Terminé").exists(): d(text="Terminé").click()
    wait(3)
    
    breakpoint(d, "22_avant_partager_story")
    if d(descriptionContains="Votre story").exists():
        d(descriptionContains="Votre story").click()
        log("Story publiée !")
        wait(10)

    log("=== ÉTAPE 5 : ACTIVATION 2FA ===")
    if d(descriptionContains="Profil").exists(): d(descriptionContains="Profil").click()
    else: d.click(0.9, 0.95)
    wait(5)
    
    if d(descriptionContains="Options").exists() or d(descriptionContains="Menu").exists(): 
        if d(descriptionContains="Options").exists(): d(descriptionContains="Options").click()
        else: d(descriptionContains="Menu").click()
    else: d.click(0.9, 0.08)
    wait(5)
    
    if d(textContains="Espace Comptes").exists() or d(textContains="Accounts Center").exists():
        d(textContains="Espace Comptes").click()
    else:
        d.click(0.5, 0.2)
    wait(8, "(chargement Espace Comptes)")
    
    if d(textContains="Mot de passe").exists():
        d(textContains="Mot de passe").click()
        wait(5)
        if d(textContains="deux facteurs").exists():
            d(textContains="deux facteurs").click()
            wait(5)
            if d(textContains=kit['pseudo']).exists(): d(textContains=kit['pseudo']).click()
            wait(5)
            if d(textContains="Application").exists():
                d(textContains="Application").click()
                wait(2)
                if d(text="Suivant").exists(): d(text="Suivant").click()
                wait(5)
                
                # Copier la clé
                if d(textContains="Copier").exists():
                    d(textContains="Copier").click()
                    wait(2)
                    secret = d.clipboard
                    log(f"Clé 2FA récupérée : {secret}")
                    kit['twofa_secret'] = secret
                    
                    if d(text="Suivant").exists(): d(text="Suivant").click()
                    elif d(text="Entrer le code").exists(): d(text="Entrer le code").click()
                    wait(5)
                    
                    import pyotp
                    totp = pyotp.TOTP(secret)
                    code_2fa = totp.now()
                    
                    code_field = d(className="android.widget.EditText")
                    if code_field.exists():
                        code_field.set_text(code_2fa)
                        wait(2)
                        if d(text="Suivant").exists(): d(text="Suivant").click()
                        wait(10, "(validation 2FA)")
                        if d(text="Terminé").exists():
                            d(text="Terminé").click()
                            log("2FA activée avec succès !")
                else:
                    log("Bouton Copier la clé introuvable.")
                    kit['twofa_secret'] = "Erreur_Copie"
        else:
            log("Option 2FA introuvable.")
    else:
        log("Menu Mot de passe introuvable.")

def notify_discord(webhook_url, pseudo, image_path):
    log(f"Envoi Discord pour {pseudo}...")
    try:
        with open(image_path, "rb") as f:
            requests.post(webhook_url, data={"content": f"✅ Compte créé: {pseudo}"}, files={"file": f})
    except Exception as e:
        log(f"Erreur Discord : {e}")

def notify_telegram(token, chat_id, pseudo, image_path):
    log(f"Envoi Telegram pour {pseudo}...")
    try:
        url = f"https://api.telegram.org/bot{token}/sendPhoto"
        with open(image_path, "rb") as f:
            requests.post(url, data={"chat_id": chat_id, "caption": f"✅ Compte créé: {pseudo}"}, files={"photo": f})
    except Exception as e:
        log(f"Erreur Telegram : {e}")

def main():
    ld = LDPlayerManager()

    kit = get_farm_kit()
    if not kit:
        return

    prepare_media(kit)
    CLONE_NAME = f"Farm_{kit['pseudo']}"
    MASTER_NAME = "MasterFarm"

    log(f"Nettoyage d'une éventuelle ancienne instance '{CLONE_NAME}'...")
    ld.quit_instance(CLONE_NAME)
    wait(5)
    import subprocess
    subprocess.run(["C:\\LDPlayer\\LDPlayer9\\ldconsole.exe", "remove", "--name", CLONE_NAME], capture_output=True)
    wait(10)

    ld.clone_instance(CLONE_NAME, MASTER_NAME)
    wait(5)

    ld.launch_instance(CLONE_NAME)
    
    log("Attente du démarrage de l'émulateur (60s)...")
    wait(40)

    instances = ld.list_instances()
    port_adb = None
    for inst in instances:
        if inst['name'] == CLONE_NAME:
            index = int(inst['id'])
            port_adb = 5555 + (index * 2)
            break
            
    if not port_adb:
        return

    import uiautomator2 as u2
    d = None
    for _ in range(20):
        try:
            d = u2.connect(f"127.0.0.1:{port_adb}")
            break
        except Exception:
            time.sleep(5)
    
    if not d:
        return

    wait(20, "(stabilisation Android)")

    try:
        d.shell("settings put system accelerometer_rotation 0")
        d.screen_on()
        wait(5)
        
        # Fermer les pubs LDPlayer
        dismiss_popups(d)
        wait(3)
        
        if not connect_proton_vpn(d):
            return

        if not create_instagram_account(d, kit):
            return

        setup_instagram_profile(d, kit)
        
        final_pic = "debug_ig_profil_final.jpg"
        d.screenshot(final_pic)
        
        with open(f"account_{kit['pseudo']}.json", "w", encoding="utf-8") as f:
            json.dump(kit, f, indent=4)
        
        
        # --- ENREGISTREMENT DANS CONTENT FACTORY ---
        log("=== ENREGISTREMENT BDD & GOOGLE SHEETS ===")
        import subprocess, json, datetime
        db_data = {
            "va_id": 1,
            "username_ig": kit['pseudo'],
            "profile_id": kit.get('profile_id', 'id_test'),
            "os": "LDPlayer",
            "password": kit['password'],
            "two_fa": kit.get('twofa_secret', ''),
            "email_numero": kit.get('phone_number', ''),
            "registration_date": datetime.datetime.now().strftime("%Y-%m-%d"),
            "market": kit.get('market', 'US')
        }
        
        try:
            log("Appel de farm_bridge_db.js...")
            result = subprocess.run(
                ["node", "farm_bridge_db.js", json.dumps(db_data)],
                capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=os.getcwd()
            )
            for line in result.stdout.split('\\n'):
                if line.startswith('JSON_OUTPUT:'):
                    data = json.loads(line.replace('JSON_OUTPUT:', ''))
                    if data['status'] == 'success':
                        log(f"Compte enregistré ! Lien Insta : {data.get('lienInsta')}")
                    else:
                        log(f"Erreur DB: {data.get('message')}")
        except Exception as e:
            log(f"Erreur d'appel DB Node.js: {e}")
            

        discord_webhook = "https://discord.com/api/webhooks/1549701862939172884/iPwlrJg1P6vPkT59LpBEdj7jR8Wp36s_G0UWT-ElUulP9VHumBu9bd0aoizZCtZTbJYN"
        telegram_token = "8667118931:AAHWvOwTBqhEb24do74s_hZ6f3x8UfG9Ca4"
        telegram_chat_id = "8133984458"
        
        notify_discord(discord_webhook, kit['pseudo'], final_pic)
        notify_telegram(telegram_token, telegram_chat_id, kit['pseudo'], final_pic)
        
        log(f"=== SUCCÈS : Compte {kit['pseudo']} créé ! ===")
    except Exception as e:
        log(f"Erreur critique : {e}")
    finally:
        log(f"Fermeture propre de l'instance '{CLONE_NAME}'")
        ld.quit_instance(CLONE_NAME)
        wait(5)

if __name__ == "__main__":
    main()
