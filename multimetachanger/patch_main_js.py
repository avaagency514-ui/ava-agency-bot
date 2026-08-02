import os

with open('static/js/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update signature
js = js.replace('function createPopupItem() {', 'function createPopupItem(defaultPath = "") {')

# 2. Update default path logic
old_input_path = '''        const inputPath = item.querySelector(".popup-path");
        btnBrowse.addEventListener("click", async () => {'''
new_input_path = '''        const inputPath = item.querySelector(".popup-path");
        if (defaultPath) inputPath.value = defaultPath;
        btnBrowse.addEventListener("click", async () => {'''
js = js.replace(old_input_path, new_input_path)

# 3. Add dropzone logic
old_add_btn = '''    if (btnAddPopup) {
        btnAddPopup.addEventListener("click", createPopupItem);
    }'''

new_add_btn = '''    if (btnAddPopup) {
        btnAddPopup.addEventListener("click", () => createPopupItem(""));
    }
    
    const popupDropzone = document.getElementById("popup-dropzone");
    if (popupDropzone) {
        ["dragenter", "dragover"].forEach(ev => popupDropzone.addEventListener(ev, e => {
            e.preventDefault(); 
            popupDropzone.style.borderColor = "var(--primary)";
            popupDropzone.style.color = "white";
        }));
        ["dragleave", "drop"].forEach(ev => popupDropzone.addEventListener(ev, e => {
            e.preventDefault(); 
            popupDropzone.style.borderColor = "rgba(255,255,255,0.2)";
            popupDropzone.style.color = "#888";
        }));
        popupDropzone.addEventListener("drop", async e => {
            const files = e.dataTransfer.files;
            if (!files.length) return;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.type.startsWith("image/")) continue;
                addLogLine("info", "Upload image popup: " + file.name);
                const formData = new FormData();
                formData.append("file", file);
                try {
                    const res = await fetch("/api/upload", { method: "POST", body: formData });
                    const data = await res.json();
                    if (data.path) {
                        createPopupItem(data.path);
                        addLogLine("info", "Image ajoutée : " + file.name);
                    } else {
                        addLogLine("error", "Erreur upload popup: " + data.error);
                    }
                } catch (err) {
                    addLogLine("error", "Erreur upload popup: " + err);
                }
            }
        });
    }'''

js = js.replace(old_add_btn, new_add_btn)

old_chkPopup = '''        if (chkPopup.checked && popupsList.children.length === 0) {
            createPopupItem();
        }'''
new_chkPopup = '''        if (chkPopup.checked && popupsList.children.length === 0) {
            // we don't automatically create one anymore
        }'''
js = js.replace(old_chkPopup, new_chkPopup)


with open('static/js/main.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('Patched main.js')
