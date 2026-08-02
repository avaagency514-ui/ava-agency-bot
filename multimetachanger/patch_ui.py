import sys

# ---------------------------------------------------------
# Patch index.html
# ---------------------------------------------------------
with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

old_popup_html = """                        <div class="sub-option" id="popup-details-container" style="display: none;">
                            <div class="form-group">
                                <label>Image à incruster :</label>
                                <div style="display: flex; gap: 10px;">
                                    <input type="text" id="input-popup-path" class="text-input" placeholder="Sélectionnez une image (PNG/JPG)..." readonly style="flex-grow: 1;">
                                    <button type="button" id="btn-browse-popup" class="btn btn-secondary">Parcourir</button>
                                </div>
                            </div>
                            
                            <div class="form-group" style="margin-top: 1rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                    <label for="input-popup-start" style="margin-bottom: 0;">Début (s) :</label>
                                    <span class="range-value" id="val-popup-start">3.0s</span>
                                </div>
                                <input type="range" id="input-popup-start" class="range-input" min="0" max="5" value="3.0" step="0.5">
                            </div>

                            <div class="form-group" style="margin-top: 1rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                    <label for="input-popup-duration" style="margin-bottom: 0;">Durée (s) :</label>
                                    <span class="range-value" id="val-popup-duration">2.0s</span>
                                </div>
                                <input type="range" id="input-popup-duration" class="range-input" min="0.1" max="10" value="2.0" step="0.1">
                            </div>
                            
                            <div class="form-group" style="margin-top: 0.5rem;">
                                <label for="select-popup-position">Position (Format Instagram Reels) :</label>
                                <select id="select-popup-position" class="select-input">
                                    <option value="center">Centre</option>
                                    <option value="top">En Haut (Safe Zone)</option>
                                    <option value="bottom">En Bas (Safe Zone)</option>
                                </select>
                            </div>
                            
                            <div class="form-group" style="margin-top: 0.5rem;">
                                <label for="select-popup-effect">Effet d'apparition :</label>
                                <select id="select-popup-effect" class="select-input">
                                    <option value="none">Aucun (Direct)</option>
                                    <option value="fade">Fondu (Fade In / Out)</option>
                                    <option value="slide">Glissement (Slide In)</option>
                                </select>
                            </div>
                        </div>"""

new_popup_html = """                        <div class="sub-option" id="popup-details-container" style="display: none; padding: 0;">
                            <div id="popups-list" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem;">
                                <!-- Popups will be added here -->
                            </div>
                            <button type="button" id="btn-add-popup" class="btn btn-secondary btn-block" style="border: 1px dashed rgba(255,255,255,0.2);">
                                ➕ Ajouter une image
                            </button>
                        </div>"""

if old_popup_html in html:
    html = html.replace(old_popup_html, new_popup_html)
else:
    # Try finding it dynamically if spacing changed
    start_idx = html.find('<div class="sub-option" id="popup-details-container"')
    if start_idx != -1:
        end_idx = html.find('</div>\n                    </div>\n\n                    <!-- Action Button -->', start_idx)
        if end_idx != -1:
            html = html[:start_idx] + new_popup_html + html[end_idx:]

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)


# ---------------------------------------------------------
# Patch main.js
# ---------------------------------------------------------
with open('static/js/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Remove old popup DOM elements mapping
old_dom_mapping = """    const popupDetailsContainer  = document.getElementById("popup-details-container");
    const inputPopupPath         = document.getElementById("input-popup-path");
    const btnBrowsePopup         = document.getElementById("btn-browse-popup");
    const inputPopupStart        = document.getElementById("input-popup-start");
    const valPopupStart          = document.getElementById("val-popup-start");
    const inputPopupDuration     = document.getElementById("input-popup-duration");
    const valPopupDuration       = document.getElementById("val-popup-duration");
    const selectPopupPosition    = document.getElementById("select-popup-position");
    const selectPopupEffect      = document.getElementById("select-popup-effect");"""

new_dom_mapping = """    const popupDetailsContainer  = document.getElementById("popup-details-container");
    const popupsList             = document.getElementById("popups-list");
    const btnAddPopup            = document.getElementById("btn-add-popup");"""

if old_dom_mapping in js:
    js = js.replace(old_dom_mapping, new_dom_mapping)
else:
    print("Warning: old dom mapping not found exactly, will try regex")
    import re
    js = re.sub(r'const popupDetailsContainer.*?const selectPopupEffect.*?;', new_dom_mapping, js, flags=re.DOTALL)


# Update chkPopup listener
old_chk_popup = """    chkPopup.addEventListener("change", () => {
        popupDetailsContainer.style.display = chkPopup.checked ? "block" : "none";
    });"""

new_chk_popup = """    chkPopup.addEventListener("change", () => {
        popupDetailsContainer.style.display = chkPopup.checked ? "block" : "none";
        if (chkPopup.checked && popupsList.children.length === 0) {
            createPopupItem(); // Add one by default
        }
    });

    // Multiple popups logic
    let popupCounter = 0;
    
    function createPopupItem() {
        popupCounter++;
        const id = popupCounter;
        
        const item = document.createElement("div");
        item.className = "popup-item";
        item.style.border = "1px solid rgba(255,255,255,0.1)";
        item.style.padding = "1rem";
        item.style.borderRadius = "8px";
        item.style.position = "relative";
        
        item.innerHTML = `
            <button type="button" class="btn-remove-popup" style="position:absolute; top:10px; right:10px; background:transparent; border:none; color:#ff4444; cursor:pointer; font-size:1.2rem;">✖</button>
            <div class="form-group">
                <label>Image ${id} :</label>
                <div style="display: flex; gap: 10px;">
                    <input type="text" class="text-input popup-path" placeholder="Sélectionnez une image (PNG/JPG)..." readonly style="flex-grow: 1;">
                    <button type="button" class="btn btn-secondary btn-browse-popup">Parcourir</button>
                </div>
            </div>
            <div class="form-group" style="margin-top: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <label style="margin-bottom: 0;">Début (s) :</label>
                    <span class="range-value popup-start-val">3.0s</span>
                </div>
                <input type="range" class="range-input popup-start" min="0" max="15" value="3.0" step="0.5">
            </div>
            <div class="form-group" style="margin-top: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <label style="margin-bottom: 0;">Durée (s) :</label>
                    <span class="range-value popup-duration-val">2.0s</span>
                </div>
                <input type="range" class="range-input popup-duration" min="0.1" max="10" value="2.0" step="0.1">
            </div>
            <div class="form-group" style="margin-top: 0.5rem;">
                <label>Position :</label>
                <select class="select-input popup-position">
                    <option value="center">Centre</option>
                    <option value="top">En Haut (Safe Zone)</option>
                    <option value="bottom">En Bas (Safe Zone)</option>
                </select>
            </div>
            <div class="form-group" style="margin-top: 0.5rem;">
                <label>Effet d'apparition :</label>
                <select class="select-input popup-effect">
                    <option value="none">Aucun (Direct)</option>
                    <option value="fade">Fondu (Fade In / Out)</option>
                    <option value="slide">Glissement (Slide In)</option>
                </select>
            </div>
        `;
        
        // Bind events
        const btnRemove = item.querySelector(".btn-remove-popup");
        btnRemove.addEventListener("click", () => item.remove());
        
        const btnBrowse = item.querySelector(".btn-browse-popup");
        const inputPath = item.querySelector(".popup-path");
        btnBrowse.addEventListener("click", async () => {
            try {
                const res = await fetch("/api/select-file");
                const data = await res.json();
                if (data.path) {
                    inputPath.value = data.path;
                }
            } catch (e) {
                console.error(e);
            }
        });
        
        const inputStart = item.querySelector(".popup-start");
        const valStart = item.querySelector(".popup-start-val");
        inputStart.addEventListener("input", () => valStart.textContent = inputStart.value + "s");
        
        const inputDur = item.querySelector(".popup-duration");
        const valDur = item.querySelector(".popup-duration-val");
        inputDur.addEventListener("input", () => valDur.textContent = inputDur.value + "s");
        
        popupsList.appendChild(item);
    }
    
    btnAddPopup.addEventListener("click", createPopupItem);
"""
if old_chk_popup in js:
    js = js.replace(old_chk_popup, new_chk_popup)


# Remove old browse popup event
old_browse_popup_event = """    btnBrowsePopup.addEventListener("click", async () => {
        try {
            const res = await fetch("/api/select-file");
            const data = await res.json();
            if (data.path) {
                inputPopupPath.value = data.path;
            }
        } catch (e) {
            console.error("Erreur lors de la selection:", e);
        }
    });"""

if old_browse_popup_event in js:
    js = js.replace(old_browse_popup_event, "")

# Remove old input event listeners
old_input_listeners = """    inputPopupStart.addEventListener("input", () => { valPopupStart.textContent = inputPopupStart.value + "s"; });
    inputPopupDuration.addEventListener("input", () => { valPopupDuration.textContent = inputPopupDuration.value + "s"; });"""
if old_input_listeners in js:
    js = js.replace(old_input_listeners, "")

# Update buildPayload
old_build_payload = """            popup_image: chkPopup.checked ? inputPopupPath.value : null,
            popup_start: chkPopup.checked ? (parseFloat(inputPopupStart.value) || 0) : 0,
            popup_duration: chkPopup.checked ? (parseFloat(inputPopupDuration.value) || 2) : 2,
            popup_position: chkPopup.checked ? (selectPopupPosition.value || "center") : "center",
            popup_effect: chkPopup.checked ? (selectPopupEffect.value || "none") : "none"
        };
    }"""

new_build_payload = """        };
        
        if (chkPopup.checked) {
            const popupItems = document.querySelectorAll('.popup-item');
            payload.popups = Array.from(popupItems).map(item => ({
                path: item.querySelector('.popup-path').value,
                start: parseFloat(item.querySelector('.popup-start').value) || 0,
                duration: parseFloat(item.querySelector('.popup-duration').value) || 2,
                position: item.querySelector('.popup-position').value || "center",
                effect: item.querySelector('.popup-effect').value || "none"
            })).filter(p => p.path); // Only keep popups with a selected image
        } else {
            payload.popups = [];
        }
        
        return payload;
    }"""

if old_build_payload in js:
    js = js.replace(old_build_payload, new_build_payload)
else:
    print("Warning: old build payload not found. Will try regex")
    import re
    js = re.sub(r'popup_image.*?};.*?}', new_build_payload, js, flags=re.DOTALL)


with open('static/js/main.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Patch UI applied.")
