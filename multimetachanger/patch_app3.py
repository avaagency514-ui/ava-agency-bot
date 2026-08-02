import os

with open('app.py', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Update signature of modify_video_metadata
c = c.replace(
    'def modify_video_metadata(input_path, output_path, reencode=False, custom_meta=None, captions_enabled=False, font_size=48, font_name="arial", caption_text="", caption_y_pct=50, popup_image=None, popup_start_min=0, popup_start_max=0, popup_duration=2, popup_position="center", popup_scale_pct=50):',
    'def modify_video_metadata(input_path, output_path, reencode=False, custom_meta=None, captions_enabled=False, font_size=48, font_name="arial", caption_text="", caption_y_pct=50, popup_image=None, popup_start=0, popup_duration=2, popup_position="center"):'
)

# 2. Update the FFmpeg logic for popup
old_ffmpeg = """        if popup_image and os.path.exists(popup_image):
            start_min = float(popup_start_min)
            start_max = float(popup_start_max)
            if start_max <= start_min:
                actual_start = start_min
            else:
                actual_start = random.uniform(start_min, start_max)
                
            actual_start = round(actual_start, 2)
            end_time = round(actual_start + float(popup_duration), 2)
            
            cmd.extend(["-i", popup_image])
            inputs_added += 1
            input_idx = inputs_added
            scaled_out = f"s{inputs_added}"
            new_out = f"v{inputs_added}"
            
            # Position logic
            if popup_position == "center":
                pos_str = "(W-w)/2:(H-h)/2"
            elif popup_position == "top":
                pos_str = "(W-w)/2:H*0.15" # 15% from top
            else: # bottom
                pos_str = "(W-w)/2:H*0.65" # 65% from top
                
            filters.append(f"[{last_video_out}][{input_idx}:v]overlay={pos_str}:enable='between(t,{actual_start},{end_time})'[{new_out}]")
            last_video_out = new_out"""

new_ffmpeg = """        if popup_image and os.path.exists(popup_image):
            actual_start = float(popup_start)
            end_time = round(actual_start + float(popup_duration), 2)
            
            cmd.extend(["-i", popup_image])
            inputs_added += 1
            input_idx = inputs_added
            new_out = f"v{inputs_added}"
            
            # Position logic
            if popup_position == "center":
                pos_str = "(W-w)/2:(H-h)/2"
            elif popup_position == "top":
                pos_str = "(W-w)/2:H*0.15" # 15% from top
            else: # bottom
                pos_str = "(W-w)/2:H*0.65" # 65% from top
                
            filters.append(f"[{last_video_out}][{input_idx}:v]overlay={pos_str}:enable='between(t,{actual_start},{end_time})'[{new_out}]")
            last_video_out = new_out"""

c = c.replace(old_ffmpeg, new_ffmpeg)

# 3. Update the parsing in bulk route and single route
old_parser = """    popup_image      = data.get('popup_image', None)
    popup_start_min  = float(data.get('popup_start_min', 0))
    popup_start_max  = float(data.get('popup_start_max', 0))
    popup_duration   = float(data.get('popup_duration', 2))
    popup_position   = data.get('popup_position', 'center')
    popup_scale_pct  = int(data.get('popup_scale_pct', 50))"""

new_parser = """    popup_image      = data.get('popup_image', None)
    popup_start      = float(data.get('popup_start', 0))
    popup_duration   = float(data.get('popup_duration', 2))
    popup_position   = data.get('popup_position', 'center')"""

c = c.replace(old_parser, new_parser)

# 4. Update the calls to modify_video_metadata
c = c.replace('popup_start_min=popup_start_min,\n                        popup_start_max=popup_start_max,\n                        popup_scale_pct=popup_scale_pct,', 'popup_start=popup_start,')

with open('app.py', 'w', encoding='utf-8') as f:
    f.write(c)

print('Done!')
