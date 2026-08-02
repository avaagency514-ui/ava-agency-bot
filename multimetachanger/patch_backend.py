import re

with open('app.py', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Update signature
old_sig = 'def modify_video_metadata(input_path, output_path, copies=1, strip_ai=False, \n                        hash_intensity=0, fake_exif=False, reencode=False,\n                        captions_enabled=False, font_size=48, font_name="arial", \n                        caption_y_pct=50, caption_text=None,\n                        popups=None):'
new_sig = 'def modify_video_metadata(input_path, output_path, reencode=False, custom_meta=None, captions_enabled=False, font_size=48, font_name="arial", caption_text="", caption_y_pct=50, popups=None, strip_ai=False, hash_intensity=0):'
c = c.replace(old_sig, new_sig)

# If it didn't replace, try a regex
if new_sig not in c:
    c = re.sub(r'def modify_video_metadata\(input_path.*?popups=None\):', new_sig, c, flags=re.DOTALL)

# 2. Update meta logic
old_meta = '''    meta = generate_random_exif()
    dt_str = meta["datetime"].strftime("%Y-%m-%dT%H:%M:%S.000000Z")'''
new_meta = '''    meta = custom_meta or generate_random_exif()
    dt_str = meta["datetime"].strftime("%Y-%m-%dT%H:%M:%S.000000Z")'''
c = c.replace(old_meta, new_meta)

with open('app.py', 'w', encoding='utf-8') as f:
    f.write(c)
