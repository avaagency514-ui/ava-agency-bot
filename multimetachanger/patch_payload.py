import re

with open('static/js/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

idx = js.find('function buildPayload()')
end_idx = js.find('async function launchSingle()', idx)

new_build_payload = """function buildPayload() {
        let captionList = [];
        if (chkCaptions.checked && textareaCaptions.value.trim()) {
           captionList = textareaCaptions.value.split('\\n').filter(c => c.trim().length > 0);
        }
        
        let payload = {
            source_path: inputSourcePath.value.trim(),
            output_dir: inputOutputPath.value.trim(),
            copies: parseInt(inputCopies.value) || 1,
            strip_ai: chkStripAi.checked,
            hash_intensity: chkHash.checked ? (parseInt(rangeIntensity.value) || 50) : 0,
            fake_exif: chkExif.checked,
            video_reencode: chkVideoReencode.checked,
            captions_enabled: chkCaptions.checked,
            font_size: parseInt(rangeFontSize.value) || 48,
            font_name: selectFont.value || "arial",
            caption_y_pct: parseInt(rangeCaptionY.value) || 50,
            captions: captionList,
        };
        
        if (chkPopup.checked) {
            const popupItems = document.querySelectorAll('.popup-item');
            payload.popups = Array.from(popupItems).map(item => ({
                path: item.querySelector('.popup-path').value,
                start: parseFloat(item.querySelector('.popup-start').value) || 0,
                duration: parseFloat(item.querySelector('.popup-duration').value) || 2,
                position: item.querySelector('.popup-position').value || "center",
                effect: item.querySelector('.popup-effect').value || "none"
            })).filter(p => p.path);
        } else {
            payload.popups = [];
        }
        
        return payload;
    }

    """

js = js[:idx] + new_build_payload + js[end_idx:]

with open('static/js/main.js', 'w', encoding='utf-8') as f:
    f.write(js)
print("buildPayload patched.")
