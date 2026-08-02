import os

with open('static/js/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

old_code = '''    btnLoadTxt.addEventListener("click", () => inputLoadTxt.click());
    inputLoadTxt.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            textareaCaptions.value = ev.target.result;
            const count = ev.target.result.split("\\n").filter(l => l.trim()).length;
            addLogLine("info", "? " + count + " captions chargées.");
        };
        reader.readAsText(file);
        inputLoadTxt.value = "";
    });'''

new_code = '''    function handleTxtFile(file) {
        if (!file || !file.name.toLowerCase().endsWith(".txt")) {
            addLogLine("error", "Veuillez sélectionner un fichier .txt");
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            textareaCaptions.value = ev.target.result;
            const count = ev.target.result.split("\\n").filter(l => l.trim()).length;
            addLogLine("info", "📄 " + count + " captions chargées depuis " + file.name);
        };
        reader.readAsText(file);
    }

    btnLoadTxt.addEventListener("click", () => inputLoadTxt.click());
    inputLoadTxt.addEventListener("change", (e) => {
        handleTxtFile(e.target.files[0]);
        inputLoadTxt.value = "";
    });

    const txtDropzone = document.getElementById("txt-dropzone-container");
    if (txtDropzone) {
        ["dragenter", "dragover"].forEach(ev => txtDropzone.addEventListener(ev, e => {
            e.preventDefault(); 
            textareaCaptions.style.borderColor = "var(--primary)";
            textareaCaptions.style.boxShadow = "0 0 10px rgba(99, 102, 241, 0.5)";
        }));
        ["dragleave", "drop"].forEach(ev => txtDropzone.addEventListener(ev, e => {
            e.preventDefault(); 
            textareaCaptions.style.borderColor = "";
            textareaCaptions.style.boxShadow = "";
        }));
        txtDropzone.addEventListener("drop", e => {
            const files = e.dataTransfer.files;
            if (files.length) {
                handleTxtFile(files[0]);
            }
        });
    }'''

js = js.replace(old_code, new_code)

with open('static/js/main.js', 'w', encoding='utf-8') as f:
    f.write(js)
