import sys

with open('app.py', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Update signature
old_sig = 'popup_position="center"):'
new_sig = 'popup_position="center", popup_effect="none"):'
c = c.replace(old_sig, new_sig)

# 2. Update modify_video_metadata overlay logic
old_logic = '''        if popup_image and os.path.exists(popup_image):
            actual_start = float(popup_start)
            end_time = round(actual_start + float(popup_duration), 2)
            
            cmd.extend(["-loop", "1", "-i", popup_image])
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
                
            filters.append(f"[{last_video_out}][{input_idx}:v]overlay={pos_str}:enable='between(t,{actual_start},{end_time})':shortest=1[{new_out}]")
            last_video_out = new_out'''

new_logic = '''        if popup_image and os.path.exists(popup_image):
            actual_start = float(popup_start)
            end_time = round(actual_start + float(popup_duration), 2)
            
            cmd.extend(["-loop", "1", "-i", popup_image])
            inputs_added += 1
            input_idx = inputs_added
            new_out = f"v{inputs_added}"
            
            # Position logic
            if popup_position == "center":
                target_y = "(H-h)/2"
            elif popup_position == "top":
                target_y = "H*0.15"
            else: # bottom
                target_y = "H*0.65"
            pos_str = f"(W-w)/2:{target_y}"
            
            if popup_effect == "fade":
                # Add fade in/out to the image stream
                img_faded = f"img_faded{inputs_added}"
                fade_filter = f"[{input_idx}:v]format=rgba,fade=t=in:st={actual_start}:d=0.5:alpha=1,fade=t=out:st={end_time-0.5}:d=0.5:alpha=1[{img_faded}]"
                filters.append(fade_filter)
                filters.append(f"[{last_video_out}][{img_faded}]overlay={pos_str}:enable='between(t,{actual_start},{end_time})':shortest=1[{new_out}]")
            elif popup_effect == "slide":
                # Slide in from bottom
                slide_y = f"max({target_y}, H - (t-{actual_start})*(H-{target_y})/0.5)"
                pos_str = f"(W-w)/2:{slide_y}"
                filters.append(f"[{last_video_out}][{input_idx}:v]overlay={pos_str}:enable='between(t,{actual_start},{end_time})':shortest=1[{new_out}]")
            else:
                filters.append(f"[{last_video_out}][{input_idx}:v]overlay={pos_str}:enable='between(t,{actual_start},{end_time})':shortest=1[{new_out}]")
            last_video_out = new_out'''

c = c.replace(old_logic, new_logic)

# 3. Update start_processing route to get popup_effect
old_sp_1 = '''    popup_duration   = float(data.get('popup_duration', 2))
    popup_position   = data.get('popup_position', 'center')'''
new_sp_1 = '''    popup_duration   = float(data.get('popup_duration', 2))
    popup_position   = data.get('popup_position', 'center')
    popup_effect     = data.get('popup_effect', 'none')'''
c = c.replace(old_sp_1, new_sp_1)

# 4. Update modify_video_metadata call in start_processing -> generate_progress
old_sp_2 = '''                    popup_start=popup_start,
                    popup_duration=popup_duration,
                    popup_position=popup_position
                )'''
new_sp_2 = '''                    popup_start=popup_start,
                    popup_duration=popup_duration,
                    popup_position=popup_position,
                    popup_effect=popup_effect
                )'''
c = c.replace(old_sp_2, new_sp_2)


with open('app.py', 'w', encoding='utf-8') as f:
    f.write(c)
print('Patched successfully!')
