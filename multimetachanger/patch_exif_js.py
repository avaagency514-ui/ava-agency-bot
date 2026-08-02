import os

with open('static/js/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Add DOM element variables
old_dom = '''    const chkExif                = document.getElementById("chk-exif");'''
new_dom = '''    const chkExif                = document.getElementById("chk-exif");
    const selectExifProfile      = document.getElementById("select-exif-profile");
    const exifDetailsContainer   = document.getElementById("exif-details-container");'''
js = js.replace(old_dom, new_dom)

# Add event listener for chkExif
old_evt = '''    chkHash.addEventListener("change", () => { hashIntensityContainer.style.display = chkHash.checked ? "block" : "none"; });'''
new_evt = '''    chkHash.addEventListener("change", () => { hashIntensityContainer.style.display = chkHash.checked ? "block" : "none"; });
    chkExif.addEventListener("change", () => { exifDetailsContainer.style.display = chkExif.checked ? "block" : "none"; });'''
js = js.replace(old_evt, new_evt)

# Add value to buildPayload
old_payload = '''            fake_exif: chkExif.checked,
            video_reencode: chkVideoReencode.checked,'''
new_payload = '''            fake_exif: chkExif.checked,
            exif_profile: selectExifProfile ? selectExifProfile.value : 'random',
            video_reencode: chkVideoReencode.checked,'''
js = js.replace(old_payload, new_payload)

with open('static/js/main.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('Patched main.js for EXIF Profile')
