import subprocess
import os

ffmpeg_path = r'C:\Users\BOSS\.gemini\antigravity\scratch\multimetachanger\ffmpeg.exe'
input_video = r'C:\Users\BOSS\.gemini\antigravity\scratch\multimetachanger\test_video.mp4'
popup_image = r'C:\Users\BOSS\Downloads\hAUUj.jpg'

cmd = [
    ffmpeg_path, '-i', input_video,
    '-i', popup_image,
    '-filter_complex', "[0:v][1:v]overlay=(W-w)/2:(H-h)/2:enable='between(t,0.5,1.5)'[v]",
    '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'fast', '-y', 'out.mp4'
]

# create dummy video
subprocess.run([ffmpeg_path, '-f', 'lavfi', '-i', 'testsrc=duration=2:size=1280x720:rate=30', '-y', input_video], capture_output=True)

# create dummy image if needed
if not os.path.exists(popup_image):
    subprocess.run([ffmpeg_path, '-f', 'lavfi', '-i', 'color=c=red:s=100x100', '-vframes', '1', '-y', popup_image], capture_output=True)

try:
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    print('SUCCESS')
except subprocess.CalledProcessError as e:
    print('ERROR')
    # Print the last 20 lines of stderr
    lines = e.stderr.split('\n')
    print('\n'.join(lines[-20:]))
