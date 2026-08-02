import os

def fix_app():
    with open('app.py', 'r', encoding='utf-8') as f:
        js = f.read()

    start = js.find('def modify_video_metadata(')
    end = js.find('# ============================================================', start)
    if end == -1:
        end = js.find('def index(', start)

    correct_func = '''def modify_video_metadata(input_path, output_path, copies=1, strip_ai=False, 
                        hash_intensity=0, fake_exif=False, reencode=False,
                        captions_enabled=False, font_size=48, font_name="arial", 
                        caption_y_pct=50, caption_text=None,
                        popups=None):
    if not os.path.exists(input_path):
        return False, "Le fichier source n'existe pas."

    ffmpeg_path = get_ffmpeg_path()
    if not ffmpeg_path:
        return False, "FFmpeg introuvable"

    meta = generate_random_exif()
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
        bitrate_v = random.choice(["2500k", "4000k", "6000k"])

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
                slide_y = f"max({target_y}\\, H - (t-{actual_start})*(H-{target_y})/0.5)"
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

        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        if hash_intensity > 0 and reencode:
            pass
        
        if tmp_png and os.path.exists(tmp_png):
            try: os.remove(tmp_png)
            except: pass

        return True, "Modifié avec succès"
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
'''
    js = js[:start] + correct_func + '\n\n' + js[end:]
    with open('app.py', 'w', encoding='utf-8') as f:
        f.write(js)
    print('Successfully patched app.py')

if __name__ == '__main__':
    fix_app()
