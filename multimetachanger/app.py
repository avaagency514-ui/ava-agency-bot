import os
import sys
import json
import uuid
import hashlib
import random
import shutil
import subprocess
import threading
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, request, jsonify, render_template, Response, send_from_directory, redirect, url_for

# Initialisation de Flask
app = Flask(__name__, template_folder='templates', static_folder='static')

# Import licence (après l'initialisation de l'app)
try:
    from license_check import check_license_at_startup, validate_license_online, save_license_key, load_license_key, logout_license
    LICENSE_MODULE_OK = True
except Exception as e:
    print(f'[LICENCE] Avertissement : module licence non chargé ({e})')
    LICENSE_MODULE_OK = False
    def check_license_at_startup(a): a.config['LICENSE_VALID'] = True; return True
    def validate_license_online(k): return {'valid': True, 'plan': 'dev', 'expires': 'jamais'}
    def save_license_key(k): pass
    def load_license_key(): return None
    def logout_license(): pass

# Sécurité pour Tkinter
try:
    import tkinter as tk
    from tkinter import filedialog
    HAS_TKINTER = True
except ImportError:
    HAS_TKINTER = False

# Vérification de Pillow
try:
    from PIL import Image
    from PIL.PngImagePlugin import PngInfo
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Vérification de piexif
try:
    import piexif
    HAS_PIEXIF = True
except ImportError:
    HAS_PIEXIF = False

# Vérification de numpy
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False


# ============================================================
# HELPER DE DIALOGUES NATIFS WINDOWS
# ============================================================
# BOITES DE DIALOGUE NATIVES (PowerShell — 100% compatible Windows)
# ============================================================

def select_file_native():
    import subprocess
    import sys
    import os
    dialog_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dialog.py')
    try:
        result = subprocess.run(
            [sys.executable, dialog_script, "file"],
            capture_output=True, text=True, timeout=120
        )
        path = result.stdout.strip()
        return path if path and os.path.exists(path) else ""
    except Exception as e:
        print(f"Dialog script error: {e}")
        return ""

def select_folder_native():
    import subprocess
    import sys
    import os
    dialog_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dialog.py')
    try:
        result = subprocess.run(
            [sys.executable, dialog_script, "folder"],
            capture_output=True, text=True, timeout=120
        )
        path = result.stdout.strip()
        return path if path and os.path.isdir(path) else ""
    except Exception as e:
        print(f"Dialog script error: {e}")
        return ""


# ============================================================
# LOGIQUE MÉTADONNÉES ET HASH
# ============================================================

def get_ffmpeg_path():
    # 1. Vérifier si un ffmpeg.exe local existe dans le dossier de l'application
    local_ffmpeg = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ffmpeg.exe')
    if os.path.exists(local_ffmpeg):
        return local_ffmpeg
    
    # 2. Sinon, vérifier s'il est global dans le PATH (avec timeout court)
    try:
        subprocess.run(["ffmpeg", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=3)
        return "ffmpeg"
    except Exception:
        return None

def check_ffmpeg():
    return get_ffmpeg_path() is not None

def get_video_width(video_path):
    """Retourne la largeur en pixels de la vidéo via ffprobe. Défaut: 1080."""
    ffmpeg_path = get_ffmpeg_path()
    if not ffmpeg_path:
        return 1080
    # ffprobe est dans le même dossier que ffmpeg
    ffprobe_path = ffmpeg_path.replace('ffmpeg.exe', 'ffprobe.exe').replace('ffmpeg', 'ffprobe')
    try:
        result = subprocess.run(
            [ffprobe_path, '-v', 'error', '-select_streams', 'v:0',
             '-show_entries', 'stream=width', '-of', 'default=noprint_wrappers=1:nokey=1', video_path],
            capture_output=True, text=True, timeout=5
        )
        width = int(result.stdout.strip().split('\n')[0])
        return width if width > 0 else 1080
    except Exception:
        return 1080

def apply_caption_formatting(text):
    import re
    # 1. Sauts de lignes
    text = text.replace('//', '\n\n')
    text = text.replace('/', '\n')
    
    # 2. Majuscule (simulation emphase/gras) avec *texte*
    text = re.sub(r'\*(.*?)\*', lambda m: m.group(1).upper(), text)
    
    # 3. Espacement stylisé (simulation italique/design) avec _texte_
    text = re.sub(r'\_(.*?)\_', lambda m: ' '.join(list(m.group(1))), text)
    
    return text

def wrap_text(text, width=28):
    import textwrap
    text = apply_caption_formatting(text)
    
    final_lines = []
    for paragraph in text.split('\n'):
        if paragraph.strip() == "":
            final_lines.append("")
        else:
            final_lines.extend(textwrap.wrap(paragraph, width=width))
            
    return "\n".join(final_lines)

def escape_ffmpeg_text(text):
    # Échapper les caractères spéciaux requis pour drawtext
    text = text.replace('\\', '\\\\')
    text = text.replace("'", "'\\\\''")
    text = text.replace(':', '\\:')
    text = text.replace('%', '\\%')
    return text

def generate_random_exif(profile="random"):
    """Génère des métadonnées EXIF réalistes."""
    makes = {
        "Apple": {
            "models": ["iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16", "iPhone 15 Pro Max", "iPhone 15", "iPhone 14 Pro Max", "iPhone 14 Pro"],
            "software": lambda: f"iOS {random.choice(['18.3', '18.2.1', '18.1.1', '17.7', '17.6'])}"
        },
        "Samsung": {
            "models": ["Galaxy S25 Ultra", "Galaxy S24 Ultra", "Galaxy S23 Ultra", "Galaxy Z Fold 6", "Galaxy Z Flip 6", "Galaxy S25"],
            "software": lambda: f"One UI {random.choice(['7.0', '6.1', '6.0', '5.1'])}"
        },
        "Google": {
            "models": ["Pixel 9 Pro XL", "Pixel 9 Pro", "Pixel 8 Pro", "Pixel 8", "Pixel 7 Pro"],
            "software": lambda: f"Android {random.choice(['15', '14', '13'])}"
        },
        "Canon": {
            "models": ["EOS R5 Mark II", "EOS R6 Mark II", "EOS R8", "EOS R50"],
            "software": lambda: f"Canon Firmware v{random.choice(['1.1.0', '1.2.1', '1.0.2'])}"
        },
        "Sony": {
            "models": ["A7R V", "A7 IV", "ZV-E1", "FX3"],
            "software": lambda: f"Sony ILCE Firmware v{random.choice(['2.00', '3.01', '1.10'])}"
        }
    }
    
    if profile == "iphone":
        make = "Apple"
    else:
        make = random.choice(list(makes.keys()))
    brand = makes[make]
    model = random.choice(brand["models"])
    software = brand["software"]()
    
    locations = [
        (48.8566, 2.3522, "Paris, France"),
        (43.7000, 7.2500, "Nice, France"),
        (45.7640, 4.8357, "Lyon, France"),
        (43.2965, 5.3698, "Marseille, France"),
        (40.7128, -74.0060, "New York, USA"),
        (34.0522, -118.2437, "Los Angeles, USA"),
        (35.6762, 139.6503, "Tokyo, Japon"),
        (51.5074, -0.1278, "Londres, UK"),
        (41.9028, 12.4964, "Rome, Italie"),
        (48.1351, 11.5820, "Munich, Allemagne"),
    ]
    lat, lon, city = random.choice(locations)
    lat += random.uniform(-0.005, 0.005)
    lon += random.uniform(-0.005, 0.005)
    
    return {
        "make": make,
        "model": model,
        "software": software,
        "datetime": datetime.now() - timedelta(
            days=random.randint(0, 180),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59)
        ),
        "gps_lat": lat,
        "gps_lon": lon,
        "gps_city": city,
        "device_id": str(uuid.uuid4())[:8].upper()
    }

def dms_from_decimal(decimal_coord):
    degrees = int(decimal_coord)
    minutes_full = (decimal_coord - degrees) * 60
    minutes = int(minutes_full)
    seconds = (minutes_full - minutes) * 60
    return [(degrees, 1), (minutes, 1), (int(seconds * 100), 100)]

def modify_image_exif(image_path, output_path, custom_exif=None):
    if not HAS_PIEXIF or not HAS_PIL:
        return False, "piexif ou Pillow manquant"
    
    exif_data = custom_exif or generate_random_exif()
    
    try:
        zeroth = {}
        exif = {}
        gps = {}
        
        zeroth[piexif.ImageIFD.Make] = exif_data["make"].encode('utf-8', 'ignore')
        zeroth[piexif.ImageIFD.Model] = exif_data["model"].encode('utf-8', 'ignore')
        zeroth[piexif.ImageIFD.Software] = exif_data["software"].encode('utf-8', 'ignore')
        
        dt_str = exif_data["datetime"].strftime("%Y:%m:%d %H:%M:%S")
        zeroth[piexif.ImageIFD.DateTime] = dt_str.encode('utf-8', 'ignore')
        
        exif[piexif.ExifIFD.DateTimeOriginal] = dt_str.encode('utf-8', 'ignore')
        exif[piexif.ExifIFD.DateTimeDigitized] = dt_str.encode('utf-8', 'ignore')
        exif[piexif.ExifIFD.LensModel] = f"{exif_data['model']} camera".encode('utf-8', 'ignore')
        exif[piexif.ExifIFD.SceneType] = b'\x01'
        exif[piexif.ExifIFD.Flash] = random.choice([0, 9, 16, 24, 25, 32])
        exif[piexif.ExifIFD.ISOSpeedRatings] = random.choice([50, 64, 100, 200, 400, 800, 1600])
        exif[piexif.ExifIFD.FocalLength] = (random.choice([24, 26, 28, 35, 50, 85]), 1)
        exif[piexif.ExifIFD.FNumber] = random.choice([(18, 10), (20, 10), (28, 10), (40, 10)])
        
        shutter = random.choice([(1, 60), (1, 125), (1, 250), (1, 500), (1, 1000)])
        exif[piexif.ExifIFD.ExposureTime] = shutter
        
        gps[piexif.GPSIFD.GPSLatitudeRef] = b'N' if exif_data["gps_lat"] >= 0 else b'S'
        gps[piexif.GPSIFD.GPSLatitude] = dms_from_decimal(abs(exif_data["gps_lat"]))
        gps[piexif.GPSIFD.GPSLongitudeRef] = b'E' if exif_data["gps_lon"] >= 0 else b'W'
        gps[piexif.GPSIFD.GPSLongitude] = dms_from_decimal(abs(exif_data["gps_lon"]))
        gps[piexif.GPSIFD.GPSAltitudeRef] = b'\x00'
        gps[piexif.GPSIFD.GPSAltitude] = (random.randint(10, 300), 1)
        
        new_exif = {"0th": zeroth, "Exif": exif, "GPS": gps, "1st": {}, "thumbnail": None}
        exif_bytes = piexif.dump(new_exif)
        
        with Image.open(image_path) as img:
            # Conserver le profil ICC si disponible pour éviter les altérations de couleur
            kwargs = {"exif": exif_bytes}
            if "icc_profile" in img.info:
                kwargs["icc_profile"] = img.info["icc_profile"]
            
            # Sauvegarder dans le bon format
            fmt = img.format or "JPEG"
            img.save(output_path, format=fmt, quality=95, **kwargs)
            
        return True, exif_data
    except Exception as e:
        return False, str(e)

def modify_image_hash(image_path, output_path, intensity=0.5):
    """
    Modifie subtilement les valeurs de pixel pour changer le hash de l'image (Pixel Magic).
    Préserve la transparence de l'image (RGBA).
    """
    if not HAS_NUMPY or not HAS_PIL:
        return False, "numpy ou Pillow manquant"
    
    try:
        # Lire le hash SHA256 original
        with open(image_path, 'rb') as f:
            original_hash = hashlib.sha256(f.read()).hexdigest()
            
        with Image.open(image_path) as img:
            fmt = img.format or "JPEG"
            has_alpha = img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info)
            
            img_array = np.array(img, dtype=np.float32)
            
            # Ajouter du bruit luma uniquement sur les couches RVB
            if has_alpha and img_array.shape[-1] == 4:
                rgb = img_array[..., :3]
                alpha = img_array[..., 3:]
                noise = np.random.normal(0, intensity, rgb.shape)
                rgb_noisy = np.clip(rgb + noise, 0, 255)
                img_array_noisy = np.concatenate([rgb_noisy, alpha], axis=-1).astype(np.uint8)
            else:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                    img_array = np.array(img, dtype=np.float32)
                noise = np.random.normal(0, intensity, img_array.shape)
                img_array_noisy = np.clip(img_array + noise, 0, 255).astype(np.uint8)
            
            new_img = Image.fromarray(img_array_noisy, img.mode)
            
            kwargs = {}
            if "icc_profile" in img.info:
                kwargs["icc_profile"] = img.info["icc_profile"]
            
            new_img.save(output_path, format=fmt, quality=95, **kwargs)
            
        with open(output_path, 'rb') as f:
            modified_hash = hashlib.sha256(f.read()).hexdigest()
            
        return True, {"original_hash": original_hash, "modified_hash": modified_hash}
    except Exception as e:
        return False, str(e)

def strip_ai_metadata(image_path, output_path):
    if not HAS_PIL:
        return False, "Pillow manquant"
    
    try:
        with Image.open(image_path) as img:
            img.load()
            fmt = img.format or "JPEG"
            
            # On recrée une nouvelle image avec uniquement les données de pixels
            # et le profil colorimétrique ICC (pour garder la fidélité visuelle),
            # mais sans aucun bloc textuel, XMP, JUMBF ou métadonnées C2PA.
            new_img = Image.new(img.mode, img.size)
            new_img.paste(img)
            
            kwargs = {}
            if "icc_profile" in img.info:
                kwargs["icc_profile"] = img.info["icc_profile"]
                
            new_img.save(output_path, format=fmt, quality=95, **kwargs)
            
        return True, "Signatures IA nettoyées"
    except Exception as e:
        return False, str(e)



def get_video_dimensions(video_path):
    """Retourne (width, height) de la vidéo. Défaut : (1080, 1920)."""
    ffmpeg_path = get_ffmpeg_path()
    if not ffmpeg_path:
        return 1080, 1920
    ffprobe_path = ffmpeg_path.replace('ffmpeg.exe', 'ffprobe.exe').replace('ffmpeg', 'ffprobe')
    try:
        result = subprocess.run(
            [ffprobe_path, '-v', 'error', '-select_streams', 'v:0',
             '-show_entries', 'stream=width,height',
             '-of', 'csv=p=0', video_path],
            capture_output=True, text=True, timeout=5
        )
        parts = result.stdout.strip().split('\n')[0].split(',')
        w, h = int(parts[0]), int(parts[1])
        return (w, h) if w > 0 else (1080, 1920)
    except Exception:
        return 1080, 1920


def render_caption_overlay(text, font_size, font_name, video_w, video_h, caption_y_pct=50):
    """
    Génère un PNG transparent avec le texte + emojis couleur centrés.
    Utilise pilmoji pour un rendu parfait des emojis.
    Retourne (chemin_png, hauteur_png) ou None si erreur.
    """
    if not HAS_PIL:
        return None
    import textwrap, uuid, os

    # --- Correspondance polices ---
    font_map = {
        "arial":        "arial.ttf",
        "impact":       "impact.ttf",
        "verdana":      "verdana.ttf",
        "comicsans":    "comic.ttf",
        "timesnewroman":"times.ttf",
        "couriernew":   "cour.ttf",
    }
    win_fonts = "C:/Windows/Fonts/"
    font_file = font_map.get(font_name, "arial.ttf")

    from PIL import ImageFont, Image as PILImage

    def load_font(path, size):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            try:
                return ImageFont.load_default(size=size)
            except Exception:
                return ImageFont.load_default()

    font_main = load_font(win_fonts + font_file, font_size)

    # --- Word-wrap (basé sur la largeur réelle de la vidéo) ---
    usable_px  = video_w * 0.82
    char_px    = font_size * 0.55
    wrap_width = max(10, int(usable_px / char_px))
    lines = []
    for para in text.split('\n'):
        if para.strip() == '':
            lines.append('')
        else:
            lines.extend(textwrap.wrap(para, width=wrap_width) or [''])

    # --- Calcul dimensions du bloc texte ---
    line_h  = font_size + int(font_size * 0.35)
    total_h = line_h * len(lines) + int(font_size * 0.5)
    total_w = video_w

    # --- Image RGBA transparente ---
    img = PILImage.new('RGBA', (total_w, total_h), (0, 0, 0, 0))
    border = max(2, font_size // 12)

    # --- Rendu avec pilmoji (gère les emojis couleur) ---
    try:
        from pilmoji import Pilmoji
        with Pilmoji(img) as renderer:
            for li, line in enumerate(lines):
                if not line:
                    continue
                y = li * line_h + int(font_size * 0.2)
                # Mesure largeur pour centrer
                try:
                    tmp_size = renderer.getsize(line, font=font_main)
                    lw = tmp_size[0]
                except Exception:
                    lw = len(line) * int(font_size * 0.6)
                x = max(0, (total_w - lw) // 2)

                # Contour noir
                for dx in range(-border, border + 1):
                    for dy in range(-border, border + 1):
                        if dx == 0 and dy == 0:
                            continue
                        renderer.text((x + dx, y + dy), line, font=font_main, fill=(0, 0, 0, 220))
                # Texte blanc + emojis couleur
                renderer.text((x, y), line, font=font_main, fill=(255, 255, 255, 255))

    except ImportError:
        # Fallback sans pilmoji (emojis en carrés mais texte OK)
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        for li, line in enumerate(lines):
            if not line:
                continue
            y = li * line_h + int(font_size * 0.2)
            try:
                bb = draw.textbbox((0, 0), line, font=font_main)
                lw = bb[2] - bb[0]
            except Exception:
                lw = len(line) * int(font_size * 0.6)
            x = max(0, (total_w - lw) // 2)
            for dx in range(-border, border + 1):
                for dy in range(-border, border + 1):
                    if dx == 0 and dy == 0:
                        continue
                    draw.text((x + dx, y + dy), line, font=font_main, fill=(0, 0, 0, 220))
            draw.text((x, y), line, font=font_main, fill=(255, 255, 255, 255))

    # --- Sauvegarde PNG temporaire ---
    tmp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_png = os.path.join(tmp_dir, f"_cap_{uuid.uuid4().hex}.png")
    img.save(tmp_png, 'PNG')
    return tmp_png, total_h



def modify_video_metadata(input_path, output_path, reencode=False, custom_meta=None, captions_enabled=False, font_size=48, font_name="arial", caption_text="", caption_y_pct=50, popups=None, strip_ai=False, hash_intensity=0):
    if not os.path.exists(input_path):
        return False, "Le fichier source n'existe pas."

    ffmpeg_path = get_ffmpeg_path()
    if not ffmpeg_path:
        return False, "FFmpeg introuvable"

    meta = custom_meta or generate_random_exif()
    dt_str = meta["datetime"].strftime("%Y-%m-%dT%H:%M:%S.000000Z")

    if captions_enabled and caption_text:
        reencode = True

    popups = popups or []
    valid_popups = [p for p in popups if p.get('path') and os.path.exists(p['path'])]
    if valid_popups:
        reencode = True

    tmp_png = None

    if reencode:
        import random
        fps      = random.choice([29.97, 30, 24])
        gop      = random.choice([12, 15, 30])
        bitrate_v = random.choice(["1000k", "1500k", "2000k"])

        cmd = [
            ffmpeg_path, "-i", input_path
        ]
        
        filters = []
        inputs_added = 0
        last_video_out = "0:v"

        for p in valid_popups:
            actual_start = float(p.get('start', 0))
            end_time = round(actual_start + float(p.get('duration', 2)), 2)
            popup_position = p.get('position', 'center')
            popup_effect = p.get('effect', 'none')
            
            cmd.extend(["-loop", "1", "-i", p['path']])
            inputs_added += 1
            input_idx = inputs_added
            new_out = f"v{inputs_added}"
            
            if popup_position == "center":
                target_y = "(H-h)/2"
            elif popup_position == "top":
                target_y = "H*0.15"
            else:
                target_y = "H*0.65"
            pos_str = f"(W-w)/2:{target_y}"
            
            if popup_effect == "fade":
                img_faded = f"img_faded{inputs_added}"
                fade_filter = f"[{input_idx}:v]format=rgba,fade=t=in:st={actual_start}:d=0.5:alpha=1,fade=t=out:st={end_time-0.5}:d=0.5:alpha=1[{img_faded}]"
                filters.append(fade_filter)
                filters.append(f"[{last_video_out}][{img_faded}]overlay={pos_str}:enable='between(t,{actual_start},{end_time})':shortest=1[{new_out}]")
            elif popup_effect == "slide":
                slide_y = f"max({target_y}\, H - (t-{actual_start})*(H-{target_y})/0.5)"
                pos_str = f"(W-w)/2:{slide_y}"
                filters.append(f"[{last_video_out}][{input_idx}:v]overlay={pos_str}:enable='between(t,{actual_start},{end_time})':shortest=1[{new_out}]")
            else:
                filters.append(f"[{last_video_out}][{input_idx}:v]overlay={pos_str}:enable='between(t,{actual_start},{end_time})':shortest=1[{new_out}]")
            last_video_out = new_out

        if captions_enabled and caption_text:
            video_w, video_h = get_video_dimensions(input_path)
            result = render_caption_overlay(caption_text, font_size, font_name, video_w, video_h, caption_y_pct)
            if result:
                tmp_png, cap_h = result
                y_pos = int((video_h - cap_h) * (caption_y_pct / 100.0))
                
                cmd.extend(["-i", tmp_png])
                inputs_added += 1
                input_idx = inputs_added
                new_out = f"v{inputs_added}"
                filters.append(f"[{last_video_out}][{input_idx}:v]overlay=(W-w)/2:{y_pos}[{new_out}]")
                last_video_out = new_out

        if filters:
            filters[-1] = filters[-1].rsplit('[', 1)[0] + '[v]'
            cmd.extend(['-filter_complex', ';'.join(filters), '-map', '[v]', '-map', '0:a?'])
            
        if not reencode:
            cmd.extend(["-map_metadata", "-1"])

        cmd.extend([
            "-c:v", "libx264",
            "-preset", "fast",
            "-r", str(fps),
            "-g", str(gop),
            "-b:v", bitrate_v,
            "-c:a", "aac",
            "-b:a", "128k",
            "-metadata", f"creation_time={dt_str}",
            "-metadata", f"make={meta['make']}",
            "-metadata", f"model={meta['model']}",
            "-metadata", f"com.apple.quicktime.software={meta['software']}",
            "-metadata", f"com.apple.quicktime.creationdate={dt_str}",
            "-y", output_path
        ])
    else:
        cmd = [
            ffmpeg_path, "-i", input_path,
            "-map_metadata", "-1",
            "-c", "copy",
            "-metadata", f"creation_time={dt_str}",
            "-metadata", f"make={meta['make']}",
            "-metadata", f"model={meta['model']}",
            "-metadata", f"com.apple.quicktime.software={meta['software']}",
            "-metadata", f"com.apple.quicktime.creationdate={dt_str}",
            "-y", output_path
        ]

    try:
        import subprocess
        if strip_ai:
            cmd.insert(1, "-bitexact")

        creationflags = 0
        if os.name == 'nt':
            creationflags = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000)

        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=creationflags)
        
        if hash_intensity > 0 and reencode:
            pass
        
        if tmp_png and os.path.exists(tmp_png):
            try: os.remove(tmp_png)
            except: pass

        return True, meta
    except subprocess.CalledProcessError as e:
        if tmp_png and os.path.exists(tmp_png):
            try: os.remove(tmp_png)
            except: pass
        return False, f"FFmpeg erreur"
    except Exception as e:
        if tmp_png and os.path.exists(tmp_png):
            try: os.remove(tmp_png)
            except: pass
        return False, f"Erreur inattendue : {str(e)}"


# ============================================================
# API FLASK
# ============================================================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "Aucun fichier"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Nom de fichier vide"}), 400
    
    # Créer le dossier uploads s'il n'existe pas
    upload_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    os.makedirs(upload_dir, exist_ok=True)
    
    # Sécuriser et sauvegarder le fichier
    file_path = os.path.join(upload_dir, file.filename)
    file.save(file_path)
    return jsonify({"path": file_path})

@app.route('/api/status', methods=['GET'])
def get_system_status():
    return jsonify({
        "pillow": HAS_PIL,
        "piexif": HAS_PIEXIF,
        "numpy": HAS_NUMPY,
        "ffmpeg": check_ffmpeg(),
        "tkinter": HAS_TKINTER
    })

@app.route('/api/select-file', methods=['POST'])
def select_file():
    if not HAS_TKINTER:
        return jsonify({"error": "Tkinter n'est pas disponible"}), 400
    file_path = select_file_native()
    return jsonify({"path": file_path})

@app.route('/api/select-folder', methods=['POST'])
def select_folder():
    if not HAS_TKINTER:
        return jsonify({"error": "Tkinter n'est pas disponible"}), 400
    folder_path = select_folder_native()
    return jsonify({"path": folder_path})

@app.route('/api/open-folder', methods=['POST'])
def open_folder():
    data = request.json or {}

    folder_path = data.get('path', '')
    if not folder_path or not os.path.exists(folder_path):
        return jsonify({"error": "Dossier invalide"}), 400
    
    # Ouvrir l'explorateur Windows sur le dossier
    try:
        os.startfile(folder_path)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/scan-folder', methods=['POST'])
def scan_folder():
    """Retourne la liste des fichiers médias dans un dossier."""
    data = request.json or {}

    folder = data.get('folder', '')
    if not folder or not os.path.isdir(folder):
        return jsonify({"error": "Dossier invalide"}), 400

    image_exts = {'.jpg', '.jpeg', '.png', '.webp'}
    video_exts = {'.mp4', '.mov', '.avi', '.mkv', '.webm'}
    supported = image_exts | video_exts

    files = []
    for f in sorted(os.listdir(folder)):
        ext = Path(f).suffix.lower()
        if ext in supported:
            files.append({
                "name": f,
                "path": os.path.join(folder, f),
                "type": "image" if ext in image_exts else "video",
                "ext": ext
            })
    return jsonify({"files": files, "count": len(files)})

@app.route('/api/process-bulk', methods=['POST'])
def start_bulk_processing():
    """Traite tous les fichiers d'un dossier source, en dupliquant le dossier complet N fois."""
    data = request.json or {}
    import json
    with open('process_payload.log', 'w') as f: json.dump(data, f)


    source_folder = data.get('source_folder', '')
    output_dir    = data.get('output_dir', './output')
    copies        = int(data.get('copies', 5))
    do_exif       = data.get('exif', True)
    do_hash       = data.get('hash', True)
    do_strip      = data.get('strip_ai', True)
    do_video      = data.get('video_reencode', False)
    hash_intensity = float(data.get('hash_intensity', 0.5))

    captions_enabled = data.get('captions_enabled', False)
    font_size        = int(data.get('font_size', 48))
    font_name        = data.get('font_name', 'arial')
    caption_y_pct    = int(data.get('caption_y_pct', 50))
    captions         = [c.strip() for c in data.get('captions', []) if c.strip()]
    
    popups = data.get('popups', [])
    
    if captions_enabled and captions:
        caption_pool = captions.copy()
        random.shuffle(caption_pool)
        def get_next_caption():
            nonlocal caption_pool
            if not caption_pool:
                caption_pool = captions.copy()
                random.shuffle(caption_pool)
            return caption_pool.pop()
    else:
        def get_next_caption(): return ""

    if not source_folder or not os.path.isdir(source_folder):
        return jsonify({"error": f"Dossier source invalide : {source_folder}"}), 400

    image_exts = {'.jpg', '.jpeg', '.png', '.webp'}
    video_exts = {'.mp4', '.mov', '.avi', '.mkv', '.webm'}
    supported  = image_exts | video_exts

    media_files = [
        f for f in sorted(os.listdir(source_folder))
        if Path(f).suffix.lower() in supported
    ]

    if not media_files:
        return jsonify({"error": "Aucun fichier média trouvé dans ce dossier."}), 400

    def generate_bulk_progress():
        os.makedirs(output_dir, exist_ok=True)
        total_files = len(media_files)
        source_folder_name = Path(source_folder).name

        yield json.dumps({"status": "info", "message": f"🗂️  Mode Bulk Dossier — {total_files} fichier(s) détecté(s) dans {source_folder}"}) + "\n"
        yield json.dumps({"status": "info", "message": f"Création de {copies} dossier(s) de variantes uniques..."}) + "\n"

        all_results = []

        # Boucle sur le nombre de copies du dossier
        for copy_idx in range(1, copies + 1):
            folder_name = f"{source_folder_name}_variant_{copy_idx}"
            file_output_dir = os.path.join(output_dir, folder_name)
            os.makedirs(file_output_dir, exist_ok=True)

            yield json.dumps({"status": "separator", "message": f"══════════════════════════════════════", "file_index": copy_idx, "file_total": copies}) + "\n"
            yield json.dumps({"status": "info", "message": f"Création du dossier variant {copy_idx}/{copies} : /{folder_name}/"}) + "\n"

            # Boucle sur les fichiers du dossier source
            for file_index, filename in enumerate(media_files, start=1):
                source = os.path.join(source_folder, filename)
                ext = Path(filename).suffix.lower()
                is_image = ext in image_exts
                is_video = ext in video_exts

                # Garder le même nom de fichier dans le dossier de destination
                output_path = os.path.join(file_output_dir, filename)

                global_progress_idx = (copy_idx - 1) * total_files + file_index
                total_progress_steps = copies * total_files

                yield json.dumps({
                    "status": "progress",
                    "index": global_progress_idx,
                    "total": total_progress_steps,
                    "message": f"  [{file_index}/{total_files}] Traitement de {filename}..."
                }) + "\n"

                if is_video and not check_ffmpeg():
                    yield json.dumps({"status": "warn", "message": f"  ↳ FFmpeg absent — {filename} ignoré."}) + "\n"
                    continue

                meta = generate_random_exif()
                working_path = source
                tmp_files_to_clean = []

                if is_image:
                    if do_strip:
                        tmp_clean = os.path.join(file_output_dir, f"_tmp_clean_{uuid.uuid4().hex}{ext}")
                        ok, msg = strip_ai_metadata(working_path, tmp_clean)
                        if ok:
                            working_path = tmp_clean
                            tmp_files_to_clean.append(tmp_clean)

                    if do_hash:
                        tmp_hash = os.path.join(file_output_dir, f"_tmp_hash_{uuid.uuid4().hex}{ext}")
                        ok, res = modify_image_hash(working_path, tmp_hash, intensity=hash_intensity)
                        if ok:
                            working_path = tmp_hash
                            tmp_files_to_clean.append(tmp_hash)

                    if do_exif:
                        ok, res_exif = modify_image_exif(working_path, output_path, custom_exif=meta)
                        if ok:
                            yield json.dumps({"status": "log", "message": f"    ✓ EXIF : {res_exif['make']} {res_exif['model']} • GPS: {res_exif['gps_city']}"}) + "\n"
                        else:
                            shutil.copy2(working_path, output_path)
                    else:
                        shutil.copy2(working_path, output_path)

                elif is_video:
                    selected_caption = ""
                    if captions_enabled and captions:
                        raw_caption = get_next_caption()
                        video_width = get_video_width(working_path)
                        # char_pixel_width ≈ 0.55 × font_size pour une police proportionnelle
                        # On laisse une marge de 10% de chaque côté = 80% de la largeur utilisable
                        usable_px = video_width * 0.80
                        char_px = font_size * 0.55
                        dynamic_width = max(10, int(usable_px / char_px))
                        selected_caption = escape_ffmpeg_text(wrap_text(raw_caption, width=dynamic_width))
                        yield json.dumps({"status": "log", "message": f"    ✓ Caption : '{raw_caption.replace(chr(10), ' ')}' (wrap={dynamic_width} car.)"}) + "\n"
                        
                    ok, res = modify_video_metadata(
                        working_path, output_path, 
                        reencode=do_video, 
                        custom_meta=meta,
                        captions_enabled=captions_enabled,
                        font_size=font_size,
                        font_name=font_name,
                        caption_text=selected_caption,
                        popups=popups,
                        caption_y_pct=caption_y_pct,
                        strip_ai=do_strip,
                        hash_intensity=hash_intensity
                    )
                    if ok:
                        yield json.dumps({"status": "log", "message": f"    ✓ Vidéo : {res['make']} {res['model']} • {res['datetime'].strftime('%d/%m/%Y')}"}) + "\n"
                    else:
                        yield json.dumps({"status": "warn", "message": f"    ✗ Erreur : {res}"}) + "\n"
                        if os.path.exists(output_path):
                            try: os.remove(output_path)
                            except: pass
                        continue

                # Nettoyage des fichiers temporaires
                for tmp in tmp_files_to_clean:
                    if os.path.exists(tmp):
                        try: os.remove(tmp)
                        except: pass

                if os.path.exists(output_path):
                    all_results.append({
                        "name": filename,
                        "path": os.path.abspath(output_path),
                        "size": f"{os.path.getsize(output_path) / 1024:.1f} KB",
                        "parent": folder_name
                    })

        yield json.dumps({
            "status": "done",
            "message": f"Bulk terminé ! {copies} dossier(s) variant(s) créé(s).",
            "files": all_results,
            "output_dir": os.path.abspath(output_dir)
        }) + "\n"

    return Response(generate_bulk_progress(), mimetype='application/json-lines')

@app.route('/api/process', methods=['POST'])

def start_processing():
    data = request.json or {}
    import json
    with open('process_payload.log', 'w') as f: json.dump(data, f)

    
    source = data.get('source', '')
    output_dir = data.get('output_dir', './output')
    copies = int(data.get('copies', 5))
    do_exif = data.get('exif', True)
    exif_profile = data.get('exif_profile', 'random')
    do_hash = data.get('hash', True)
    do_strip = data.get('strip_ai', True)
    do_video = data.get('video_reencode', False) # True = Reencode complet, False = Copie rapide (metadata uniquement)
    hash_intensity = float(data.get('hash_intensity', 0.5))
    
    captions_enabled = data.get('captions_enabled', False)
    font_size        = int(data.get('font_size', 48))
    font_name        = data.get('font_name', 'arial')
    caption_y_pct    = int(data.get('caption_y_pct', 50))
    captions         = [c.strip() for c in data.get('captions', []) if c.strip()]
    
    popups = data.get('popups', [])
    
    if captions_enabled and captions:
        caption_pool = captions.copy()
        random.shuffle(caption_pool)
        def get_next_caption():
            nonlocal caption_pool
            if not caption_pool:
                caption_pool = captions.copy()
                random.shuffle(caption_pool)
            return caption_pool.pop()
    else:
        def get_next_caption(): return ""
    
    if not source or not os.path.exists(source):
        return jsonify({"error": f"Fichier source introuvable : {source}"}), 400
        
    ext = Path(source).suffix.lower()
    base_name = Path(source).stem
    
    image_exts = ['.jpg', '.jpeg', '.png', '.webp']
    video_exts = ['.mp4', '.mov', '.avi', '.mkv', '.webm']
    
    is_image = ext in image_exts
    is_video = ext in video_exts
    
    if not is_image and not is_video:
        return jsonify({"error": f"Format de fichier non pris en charge : {ext}"}), 400

    def generate_progress():
        os.makedirs(output_dir, exist_ok=True)
        yield json.dumps({"status": "info", "message": f"Démarrage du traitement de {Path(source).name}"}) + "\n"
        
        # Pour les vidéos, vérification FFmpeg
        if is_video and not check_ffmpeg():
            yield json.dumps({"status": "error", "message": "FFmpeg n'est pas installé ou n'est pas dans le PATH. Impossible de traiter les vidéos."}) + "\n"
            return

        generated_files = []

        for i in range(1, copies + 1):
            out_name = f"{uuid.uuid4().hex}{ext}"
            output_path = os.path.join(output_dir, out_name)
            
            yield json.dumps({"status": "progress", "index": i, "total": copies, "message": f"Création de la copie {i}/{copies}..."}) + "\n"
            
            meta = generate_random_exif()
            working_path = source
            
            # Fichiers temporaires pour les étapes intermédiaires
            tmp_files_to_clean = []
            
            if is_image:
                # Étape 1 : Nettoyer métadonnées IA
                if do_strip:
                    tmp_clean = os.path.join(output_dir, f"_tmp_clean_{uuid.uuid4().hex}{ext}")
                    ok, msg = strip_ai_metadata(working_path, tmp_clean)
                    if ok:
                        working_path = tmp_clean
                        tmp_files_to_clean.append(tmp_clean)
                        yield json.dumps({"status": "log", "message": f"  [Copie {i}] Signatures IA nettoyées."}) + "\n"
                    else:
                        yield json.dumps({"status": "warn", "message": f"  [Copie {i}] Échec nettoyage IA: {msg}. Utilisation de l'image de base."}) + "\n"

                # Étape 2 : Modifier le hash (Pixel Magic)
                if do_hash:
                    tmp_hash = os.path.join(output_dir, f"_tmp_hash_{uuid.uuid4().hex}{ext}")
                    ok, res = modify_image_hash(working_path, tmp_hash, intensity=hash_intensity)
                    if ok:
                        working_path = tmp_hash
                        tmp_files_to_clean.append(tmp_hash)
                        yield json.dumps({"status": "log", "message": f"  [Copie {i}] Pixel Magic appliqué. Hash d'origine: {res['original_hash'][:12]}... -> Nouveau hash: {res['modified_hash'][:12]}..."}) + "\n"
                    else:
                        yield json.dumps({"status": "warn", "message": f"  [Copie {i}] Échec Pixel Magic: {res}. Utilisation du fichier précédent."}) + "\n"

                # Étape 3 : Modifier les métadonnées EXIF (Appareil / GPS)
                if do_exif:
                    ok, res = modify_image_exif(working_path, output_path, custom_exif=meta)
                    if ok:
                        yield json.dumps({
                            "status": "log", 
                            "message": f"  [Copie {i}] EXIF injecté : {res['make']} {res['model']} ({res['software']}) - GPS: {res['gps_city']} ({res['gps_lat']:.4f}, {res['gps_lon']:.4f})"
                        }) + "\n"
                    else:
                        shutil.copy2(working_path, output_path)
                        yield json.dumps({"status": "warn", "message": f"  [Copie {i}] Échec injection EXIF: {res}. Copie simple effectuée."}) + "\n"
                else:
                    # Copie finale si pas d'EXIF demandé
                    shutil.copy2(working_path, output_path)
                    yield json.dumps({"status": "log", "message": f"  [Copie {i}] Fichier final enregistré."}) + "\n"
            
            elif is_video:
                # Traitement vidéo
                mode_str = "Re-encodage (Hash changé)" if do_video else "Copie rapide (Métadonnées uniquement)"
                yield json.dumps({"status": "log", "message": f"  [Copie {i}] Traitement vidéo par FFmpeg en mode: {mode_str}..."}) + "\n"
                
                selected_caption = ""
                if captions_enabled and captions:
                    raw_caption = get_next_caption()
                    video_width = get_video_width(working_path)
                    usable_px = video_width * 0.80
                    char_px = font_size * 0.55
                    dynamic_width = max(10, int(usable_px / char_px))
                    selected_caption = escape_ffmpeg_text(wrap_text(raw_caption, width=dynamic_width))
                    yield json.dumps({"status": "log", "message": f"  [Copie {i}] Caption : '{raw_caption.replace(chr(10), ' ')}' (wrap={dynamic_width} car.)"}) + "\n"
                
                ok, res = modify_video_metadata(
                    working_path, output_path, 
                    reencode=do_video, 
                    custom_meta=meta,
                    captions_enabled=captions_enabled,
                    font_size=font_size,
                    font_name=font_name,
                    caption_text=selected_caption,
                    popups=popups,
                    caption_y_pct=caption_y_pct,
                    strip_ai=do_strip,
                    hash_intensity=hash_intensity
                )
                if ok:
                    yield json.dumps({
                        "status": "log", 
                        "message": f"  [Copie {i}] Vidéo générée avec succès. Modèle injecté : {res['make']} {res['model']} - Date : {res['datetime'].strftime('%d/%m/%Y %H:%M')}"
                    }) + "\n"
                else:
                    yield json.dumps({"status": "error", "message": f"  [Copie {i}] Échec du traitement de la vidéo: {res}"}) + "\n"
                    # Supprimer le fichier corrompu s'il a commencé à s'écrire
                    if os.path.exists(output_path):
                        try: os.remove(output_path)
                        except: pass
                    continue
            
            # Nettoyer les fichiers temporaires pour cette copie
            for tmp in tmp_files_to_clean:
                if os.path.exists(tmp):
                    try:
                        os.remove(tmp)
                    except Exception as e:
                        pass
                        
            if os.path.exists(output_path):
                generated_files.append({
                    "name": out_name,
                    "path": os.path.abspath(output_path),
                    "size": f"{os.path.getsize(output_path) / 1024:.1f} KB"
                })

        yield json.dumps({
            "status": "done", 
            "message": "Opération terminée !", 
            "files": generated_files,
            "output_dir": os.path.abspath(output_dir)
        }) + "\n"

    return Response(generate_progress(), mimetype='application/json-lines')

def find_available_port(start_port=5000):
    import socket
    port = start_port
    while port < start_port + 100:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                port += 1
    return start_port


# ============================================================
# LICENSE GATE
# ============================================================
LICENSE_ACTIVE = check_license_at_startup(app)

@app.route('/license')
def license_page():
    return render_template('license.html')

@app.route('/api/activate-license', methods=['POST'])
def activate_license():
    global LICENSE_ACTIVE
    data = request.json or {}
    key = data.get('key', '').strip().upper()
    result = validate_license_online(key)
    if result.get('valid'):
        save_license_key(key)
        app.config['LICENSE_VALID'] = True
        app.config['LICENSE_PLAN'] = result.get('plan', '?')
        app.config['LICENSE_EXPIRES'] = result.get('expires', 'jamais')
        LICENSE_ACTIVE = True
        return jsonify(result)
    return jsonify(result), 403

@app.route('/api/logout', methods=['POST'])
def api_logout():
    global LICENSE_ACTIVE
    logout_license()
    app.config['LICENSE_VALID'] = False
    app.config['LICENSE_PLAN'] = None
    app.config['LICENSE_EXPIRES'] = None
    LICENSE_ACTIVE = False
    return jsonify({"ok": True})

@app.before_request
def require_license():
    exempt = ['/license', '/api/activate-license']
    if request.path in exempt or request.path.startswith('/static/'):
        return
    if not app.config.get('LICENSE_VALID', False):
        from flask import redirect, url_for
        return redirect(url_for('license_page'))

if __name__ == '__main__':
    port = 5000
    print("--------------------------------------------------")
    print(" Lanceur de serveur Flask pour MultiMetaChanger GUI")
    print(f" L'interface est disponible sur http://127.0.0.1:{port}")
    print("--------------------------------------------------")
    
    # Ouvrir le navigateur automatiquement
    def open_browser():
        import webbrowser
        webbrowser.open(f"http://127.0.0.1:{port}")
    
    # Lancer l'ouverture du navigateur après un court délai (1.2 seconde)
    # Désactivé pour que ça tourne en silence en arrière-plan
    # threading.Timer(1.2, open_browser).start()
    
    # Lancement sur le port disponible — threaded=True permet de gérer plusieurs requêtes simultanément
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)
