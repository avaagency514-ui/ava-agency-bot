document.addEventListener("DOMContentLoaded", () => {
    const systemStatusEl         = document.getElementById("system-status");
    const dropzone               = document.getElementById("dropzone");
    const selectedFileDisplay    = document.getElementById("selected-file-display");
    const selectedFileName       = document.getElementById("selected-file-name");
    const selectedFileType       = document.getElementById("selected-file-type");
    const fileIcon               = document.getElementById("file-icon");
    const inputSourcePath        = document.getElementById("input-source-path");
    const btnClearFile           = document.getElementById("btn-clear-file");
    const btnBrowseFile          = document.getElementById("btn-browse-file");
    const inputOutputPath        = document.getElementById("input-output-path");
    const btnBrowseFolder        = document.getElementById("btn-browse-folder");
    const inputCopies            = document.getElementById("input-copies");
    const btnStepDecrement       = document.getElementById("btn-step-decrement");
    const btnStepIncrement       = document.getElementById("btn-step-increment");
    const imageOptions           = document.getElementById("image-options");
    const videoOptions           = document.getElementById("video-options");
    const chkStripAi             = document.getElementById("chk-strip-ai");
    const chkHash                = document.getElementById("chk-hash");
    const hashIntensityContainer = document.getElementById("hash-intensity-container");
    const rangeIntensity         = document.getElementById("range-intensity");
    const valIntensity           = document.getElementById("val-intensity");
    const chkExif                = document.getElementById("chk-exif");
    const selectExifProfile      = document.getElementById("select-exif-profile");
    const exifDetailsContainer   = document.getElementById("exif-details-container");
    const chkVideoReencode       = document.getElementById("chk-video-reencode");
    const captionOptions         = document.getElementById("caption-options");
    const chkCaptions            = document.getElementById("chk-captions");
    const captionDetailsContainer= document.getElementById("caption-details-container");
    const rangeFontSize          = document.getElementById("range-font-size");
    const valFontSize            = document.getElementById("val-font-size");
    const selectFont             = document.getElementById("select-font");
    const textareaCaptions       = document.getElementById("textarea-captions");
    const btnLoadTxt             = document.getElementById("btn-load-txt");
    const inputLoadTxt           = document.getElementById("input-load-txt");
    const rangeCaptionY          = document.getElementById("range-caption-y");
    const valCaptionY            = document.getElementById("val-caption-y");
    const popupOptions           = document.getElementById("popup-options");
    const chkPopup               = document.getElementById("chk-popup");
    const popupDetailsContainer  = document.getElementById("popup-details-container");
    const popupsList             = document.getElementById("popups-list");
    const btnAddPopup            = document.getElementById("btn-add-popup");
    const btnProcess             = document.getElementById("btn-process");
    const btnClearLogs           = document.getElementById("btn-clear-logs");
    const consoleEl              = document.getElementById("console");
    const progressContainer      = document.getElementById("progress-container");
    const progressBar            = document.getElementById("progress-bar");
    const progressText           = document.getElementById("progress-text");
    const resultsArea            = document.getElementById("results-area");
    const resultsList            = document.getElementById("results-list");
    const btnOpenOutputDir       = document.getElementById("btn-open-output-dir");
    const modeSingleDiv          = document.getElementById("mode-single");
    const modeBulkDiv            = document.getElementById("mode-bulk");
    const modeBtnSingle          = document.getElementById("mode-btn-single");
    const modeBtnBulk            = document.getElementById("mode-btn-bulk");
    const inputBulkSource        = document.getElementById("input-bulk-source");
    const btnBrowseBulkSource    = document.getElementById("btn-browse-bulk-source");
    const bulkFileCount          = document.getElementById("bulk-file-count");
    const bulkCountText          = document.getElementById("bulk-count-text");

    let currentFileExtension = "";
    let currentMode = "single";
    let bulkSourceFolder = "";
    let bulkFileList = [];

    function addLogLine(type, message) {
        const line = document.createElement("div");
        line.className = "console-line " + type;
        const ts = new Date().toLocaleTimeString();
        line.innerHTML = '<span style="color:var(--text-muted);margin-right:8px">[' + ts + "]</span>" + message;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    async function checkSystemStatus() {
        try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 6000);
            const res = await fetch("/api/status", { signal: controller.signal });
            clearTimeout(tid);
            const status = await res.json();
            const isAllOk = status.pillow && status.piexif && status.numpy;
            let html;
            if (isAllOk) {
                html = status.ffmpeg
                    ? '<span class="status-badge ok">🚀 Système prêt (Image &amp; Vidéo)</span>'
                    : '<span class="status-badge warn">🚀 Prêt (Images uniquement — FFmpeg absent)</span>';
                if (!status.ffmpeg) { chkVideoReencode.disabled = true; }
            } else {
                html = '<span class="status-badge warn">⚠️ Dépendances manquantes</span>';
            }
            systemStatusEl.innerHTML = html;
        } catch (e) {
            systemStatusEl.innerHTML = '<span class="status-badge warn">⚠️ Serveur déconnecté</span>';
        }
    }
    checkSystemStatus();

    modeBtnSingle.addEventListener("click", () => switchMode("single"));
    modeBtnBulk.addEventListener("click",   () => switchMode("bulk"));

    function switchMode(mode) {
        currentMode = mode;
        modeBtnSingle.classList.toggle("active", mode === "single");
        modeBtnBulk.classList.toggle("active",   mode === "bulk");
        modeSingleDiv.style.display = mode === "single" ? "block" : "none";
        modeBulkDiv.style.display   = mode === "bulk"   ? "block" : "none";
        if (mode === "bulk") {
            imageOptions.style.display = "block";
            videoOptions.style.display = "block";
            captionOptions.style.display = "block";
            checkBulkReady();
        } else {
            if (isVideoExtension(currentFileExtension)) {
            videoOptions.style.display = "block";
            captionOptions.style.display = "block";
            popupOptions.style.display = "block";
        } else {
            videoOptions.style.display = "none";
            captionOptions.style.display = "none";
            popupOptions.style.display = "none";
        }
            btnProcess.disabled = !inputSourcePath.value;
        }
    }

    function checkBulkReady() {
        if (currentMode !== "bulk") return;
        btnProcess.disabled = !(bulkSourceFolder && bulkFileList.length > 0);
        btnProcess.textContent = bulkFileList.length > 0
            ? "🚀 Lancer le traitement (" + bulkFileList.length + " fichier" + (bulkFileList.length > 1 ? "s" : "") + ")"
            : "🚀 Lancer la génération des copies";
    }

    btnBrowseFile.addEventListener("click", async () => {
        try {
            addLogLine("info", "Ouverture de la sélection de fichier...");
            const res = await fetch("/api/select-file", { method: "POST" });
            const data = await res.json();
            if (data.path) handleFileSelected(data.path);
            else addLogLine("warn", "Aucun fichier sélectionné.");
        } catch (e) { addLogLine("error", "Erreur: " + e); }
    });

    btnBrowseFolder.addEventListener("click", async () => {
        try {
            addLogLine("info", "Ouverture de la sélection de dossier...");
            const res = await fetch("/api/select-folder", { method: "POST" });
            const data = await res.json();
            if (data.path) {
                inputOutputPath.value = data.path;
                addLogLine("info", "Dossier de destination : " + data.path);
            } else addLogLine("warn", "Aucun dossier sélectionné.");
        } catch (e) { addLogLine("error", "Erreur: " + e); }
    });

    btnBrowseBulkSource.addEventListener("click", async () => {
        try {
            addLogLine("info", "Ouverture de la sélection de dossier source...");
            const res = await fetch("/api/select-folder", { method: "POST" });
            const data = await res.json();
            if (data.path) { inputBulkSource.value = data.path; await scanBulkFolder(data.path); }
        } catch (e) { addLogLine("error", "Erreur: " + e); }
    });

    inputBulkSource.addEventListener("change", async () => {
        const folder = inputBulkSource.value.trim();
        if (folder) await scanBulkFolder(folder);
    });

    async function scanBulkFolder(folder) {
        bulkSourceFolder = folder;
        bulkFileList = [];
        bulkFileCount.style.display = "none";
        try {
            const res = await fetch("/api/scan-folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder })
            });
            const data = await res.json();
            if (data.error) { addLogLine("error", "Scan: " + data.error); checkBulkReady(); return; }
            bulkFileList = data.files || [];
            const imgs = bulkFileList.filter(f => f.type === "image").length;
            const vids = bulkFileList.filter(f => f.type === "video").length;
            let label = "🚀 " + data.count + " fichier(s)";
            if (imgs > 0) label += "  " + imgs + " image" + (imgs > 1 ? "s" : "");
            if (vids > 0) label += "  " + vids + " vidéo" + (vids > 1 ? "s" : "");
            bulkCountText.textContent = label;
            bulkFileCount.style.display = "flex";
            addLogLine("info", label);
            checkBulkReady();
        } catch (err) { addLogLine("error", "Erreur scan: " + err); }
    }

    ["dragenter", "dragover"].forEach(ev => dropzone.addEventListener(ev, e => {
        e.preventDefault(); dropzone.classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach(ev => dropzone.addEventListener(ev, e => {
        e.preventDefault(); dropzone.classList.remove("dragover");
    }));
    dropzone.addEventListener("drop", async e => {
        const files = e.dataTransfer.files;
        if (!files.length) return;
        const file = files[0];
        addLogLine("info", "Import: " + file.name);
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.path) handleFileSelected(data.path);
        else addLogLine("error", "Erreur upload: " + data.error);
    });

    function isVideoExtension(ext) {
        return [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes((ext || "").toLowerCase());
    }
    function isImageExtension(ext) {
        return [".jpg", ".jpeg", ".png", ".webp"].includes((ext || "").toLowerCase());
    }

    function handleFileSelected(filePath) {
        const filename = filePath.split(/[\\\/]/).pop();
        const ext = "." + filename.split(".").pop().toLowerCase();
        currentFileExtension = ext;
        inputSourcePath.value = filePath;
        selectedFileName.textContent = filename;
        if (isVideoExtension(ext)) {
            selectedFileType.textContent = "Fichier Vidéo " + ext.toUpperCase();
            fileIcon.textContent = "🚀";
            imageOptions.style.display = "none";
            videoOptions.style.display = "block";
            captionOptions.style.display = "block";
            popupOptions.style.display = "block";
            addLogLine("info", "Vidéo chargée : " + filename);
        } else if (isImageExtension(ext)) {
            selectedFileType.textContent = "Fichier Image " + ext.toUpperCase();
            fileIcon.textContent = "🚀?";
            imageOptions.style.display = "block";
            videoOptions.style.display = "none";
            captionOptions.style.display = "none";
            popupOptions.style.display = "none";
            addLogLine("info", "Image chargée : " + filename);
        } else {
            selectedFileType.textContent = "Fichier " + ext.toUpperCase();
            fileIcon.textContent = "🚀";
            imageOptions.style.display = "block";
            videoOptions.style.display = "none";
            captionOptions.style.display = "none";
            popupOptions.style.display = "none";
        }
        dropzone.style.display = "none";
        selectedFileDisplay.style.display = "block";
        btnProcess.disabled = false;
        btnProcess.textContent = "🚀 Lancer la génération des copies";
    }

    btnClearFile.addEventListener("click", () => {
        inputSourcePath.value = "";
        currentFileExtension = "";
        dropzone.style.display = "block";
        selectedFileDisplay.style.display = "none";
        captionOptions.style.display = "none";
        videoOptions.style.display = "none";
        popupOptions.style.display = "none";
        btnProcess.disabled = true;
        btnProcess.textContent = "🚀 Lancer la génération des copies";
        addLogLine("system-msg", "Fichier source retiré.");
    });

    btnStepDecrement.addEventListener("click", () => {
        let val = parseInt(inputCopies.value, 10) || 1;
        if (val > 1) inputCopies.value = val - 1;
    });
    btnStepIncrement.addEventListener("click", () => {
        let val = parseInt(inputCopies.value, 10) || 1;
        if (val < 100) inputCopies.value = val + 1;
    });
    inputCopies.addEventListener("change", () => {
        let val = parseInt(inputCopies.value, 10) || 5;
        if (val < 1) inputCopies.value = 1;
        if (val > 100) inputCopies.value = 100;
    });

    rangeIntensity.addEventListener("input", () => { valIntensity.textContent = rangeIntensity.value; });
    chkHash.addEventListener("change", () => { hashIntensityContainer.style.display = chkHash.checked ? "block" : "none"; });
    chkExif.addEventListener("change", () => { exifDetailsContainer.style.display = chkExif.checked ? "block" : "none"; });
    chkCaptions.addEventListener("change", () => { captionDetailsContainer.style.display = chkCaptions.checked ? "block" : "none"; });
    chkPopup.addEventListener("change", () => {
        popupDetailsContainer.style.display = chkPopup.checked ? "block" : "none";
        if (chkPopup.checked && popupsList.children.length === 0) {
            // we don't automatically create one anymore
        }
    });

    let popupCounter = 0;
    
    function createPopupItem(defaultPath = "") {
        popupCounter++;
        const id = popupCounter;
        
        const item = document.createElement("div");
        item.className = "popup-item";
        item.style.border = "1px solid rgba(255,255,255,0.1)";
        item.style.padding = "1rem";
        item.style.borderRadius = "8px";
        item.style.position = "relative";
        item.style.marginBottom = "1rem";
        
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
        
        const btnRemove = item.querySelector(".btn-remove-popup");
        btnRemove.addEventListener("click", () => item.remove());
        
        const btnBrowse = item.querySelector(".btn-browse-popup");
        const inputPath = item.querySelector(".popup-path");
        if (defaultPath) inputPath.value = defaultPath;
        btnBrowse.addEventListener("click", async () => {
            try {
                const res = await fetch("/api/select-file", { method: "POST" });
                const data = await res.json();
                if (data.path) inputPath.value = data.path;
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
    
    if (btnAddPopup) {
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
    }
    rangeFontSize.addEventListener("input", () => { valFontSize.textContent = rangeFontSize.value; });
    if (rangeCaptionY && valCaptionY) {
        rangeCaptionY.addEventListener("input", () => {
            valCaptionY.textContent = rangeCaptionY.value + "%";
        });
    }

    function handleTxtFile(file) {
        if (!file || !file.name.toLowerCase().endsWith(".txt")) {
            addLogLine("error", "Veuillez sélectionner un fichier .txt");
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            textareaCaptions.value = ev.target.result;
            const count = ev.target.result.split("\n").filter(l => l.trim()).length;
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
    }

    btnClearLogs.addEventListener("click", () => { consoleEl.innerHTML = ""; addLogLine("system-msg", "Console effacée."); });

    btnProcess.addEventListener("click", async () => {
        if (currentMode === "bulk") await launchBulk();
        else await launchSingle();
    });

    function buildPayload() {
        let captionList = [];
        if (chkCaptions.checked && textareaCaptions.value.trim()) {
           captionList = textareaCaptions.value.split('\n').filter(c => c.trim().length > 0);
        }
        
        let payload = {
            source_path: inputSourcePath.value.trim(),
            output_dir: inputOutputPath.value.trim(),
            copies: parseInt(inputCopies.value) || 1,
            strip_ai: chkStripAi.checked,
            hash_intensity: chkHash.checked ? (parseInt(rangeIntensity.value) || 50) : 0,
            fake_exif: chkExif.checked,
            exif_profile: selectExifProfile ? selectExifProfile.value : 'random',
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

    
    function lockUI() {
        btnProcess.disabled = true;
        progressContainer.style.display = 'block';
    }

    function unlockUI() {
        btnProcess.disabled = false;
        // Don't hide progress immediately so user can see it finished
    }

    
    async function streamProcess(url, payload) {
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = 'Préparation...';
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Erreur serveur: ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    handleLogData(data);
                } catch (e) {
                    console.error('JSON parse error:', e, line);
                }
            }
        }
        
        if (buffer.trim()) {
            try {
                handleLogData(JSON.parse(buffer));
            } catch (e) {}
        }
    }

    async function launchSingle() {
        const source = inputSourcePath.value;
        if (!source) return;
        lockUI();
        addLogLine("info", "🚀 D�MARRAGE � " + source);
        try { await streamProcess("/api/process", { source, ...buildPayload() }); }
        catch (err) { addLogLine("error", "? " + err.message); }
        unlockUI();
    }

    async function launchBulk() {
        if (!bulkSourceFolder || bulkFileList.length === 0) return;
        lockUI();
        addLogLine("info", "🚀? BULK � " + bulkSourceFolder);
        try { await streamProcess("/api/process-bulk", { source_folder: bulkSourceFolder, ...buildPayload() }); }
        catch (err) { addLogLine("error", "? " + err.message); }
        unlockUI();
        if (currentMode === "bulk") checkBulkReady();
    }

    function handleLogData(data) {
        switch (data.status) {
            case "info":      addLogLine("info", data.message); break;
            case "separator": addLogLine("system-msg", data.message); break;
            case "progress": {
                const pct = Math.round((data.index / data.total) * 100);
                progressBar.style.width = pct + "%";
                progressText.textContent = "Traitement : " + pct + "% (" + data.index + "/" + data.total + ")";
                addLogLine("progress", data.message);
                break;
            }
            case "log":  addLogLine("log", data.message); break;
            case "warn": addLogLine("warn", data.message); break;
            case "error":addLogLine("error", data.message); break;
            case "done":
                addLogLine("done", "🚀 " + data.message);
                progressBar.style.width = "100%";
                progressText.textContent = "Termin� !";
                if (data.files && data.files.length > 0) showResults(data.files, data.output_dir);
                break;
        }
    }

    function showResults(files, outputDir) {
        resultsArea.style.display = "block";
        resultsList.innerHTML = "";
        btnOpenOutputDir.onclick = () => openOutputFolder(outputDir);
        files.forEach(file => {
            const item = document.createElement("div");
            item.className = "result-item";
            item.innerHTML = '<div class="result-name-group"><span>🚀</span><div style="display:flex;flex-direction:column;min-width:0"><span class="result-file-name" title="' + file.name + '">' + file.name + '</span><span class="result-file-size">' + file.size + "</span></div></div>" +
                '<div class="result-actions"><button class="btn-open-file" data-path="' + file.path + '">Ouvrir</button></div>';
            item.querySelector(".btn-open-file").addEventListener("click", () => openOutputFolder(file.path));
            resultsList.appendChild(item);
        });
        resultsArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async function openOutputFolder(path) {
        try { await fetch("/api/open-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }); } catch (e) {}
    }

    // Déconnexion
    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
        btnLogout.addEventListener("click", async () => {
            if (confirm("Êtes-vous sûr de vouloir vous déconnecter ? Vous devrez entrer votre clé de licence à nouveau.")) {
                try {
                    await fetch("/api/logout", { method: "POST" });
                    window.location.reload();
                } catch (e) {
                    console.error("Erreur déconnexion:", e);
                }
            }
        });
    }
});
