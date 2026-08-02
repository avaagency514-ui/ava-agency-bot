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
                    ? '<span class="status-badge ok">🚀 Syst�me prêt (Image & Vid�o)</span>'
                    : '<span class="status-badge warn">🚀 Pr�t (Images uniquement � FFmpeg absent)</span>';
                if (!status.ffmpeg) { chkVideoReencode.disabled = true; }
            } else {
                html = '<span class="status-badge warn">🚀 D�pendances manquantes</span>';
            }
            systemStatusEl.innerHTML = html;
        } catch (e) {
            systemStatusEl.innerHTML = '<span class="status-badge warn">🚀 Serveur d�connect�</span>';
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
            videoOptions.style.display = "none";
            captionOptions.style.display = isVideoExtension(currentFileExtension) ? "block" : "none";
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
            if (imgs > 0) label += " � " + imgs + " image" + (imgs > 1 ? "s" : "");
            if (vids > 0) label += " � " + vids + " vidéo" + (vids > 1 ? "s" : "");
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
            selectedFileType.textContent = "Fichier Vid�o " + ext.toUpperCase();
            fileIcon.textContent = "🚀";
            imageOptions.style.display = "none";
            videoOptions.style.display = "block";
            captionOptions.style.display = "block";
            addLogLine("info", "Vid�o charg�e : " + filename);
        } else if (isImageExtension(ext)) {
            selectedFileType.textContent = "Fichier Image " + ext.toUpperCase();
            fileIcon.textContent = "🚀?";
            imageOptions.style.display = "block";
            videoOptions.style.display = "none";
            captionOptions.style.display = "none";
            addLogLine("info", "Image charg�e : " + filename);
        } else {
            selectedFileType.textContent = "Fichier " + ext.toUpperCase();
            fileIcon.textContent = "🚀";
            imageOptions.style.display = "block";
            videoOptions.style.display = "none";
            captionOptions.style.display = "none";
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
        btnProcess.disabled = true;
        btnProcess.textContent = "🚀 Lancer la génération des copies";
        addLogLine("system-msg", "Fichier source retir�.");
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
    chkCaptions.addEventListener("change", () => { captionDetailsContainer.style.display = chkCaptions.checked ? "block" : "none"; });
    rangeFontSize.addEventListener("input", () => { valFontSize.textContent = rangeFontSize.value; });

    btnLoadTxt.addEventListener("click", () => inputLoadTxt.click());
    inputLoadTxt.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            textareaCaptions.value = ev.target.result;
            const count = ev.target.result.split("\n").filter(l => l.trim()).length;
            addLogLine("info", "? " + count + " captions charg�es.");
        };
        reader.readAsText(file);
        inputLoadTxt.value = "";
    });

    btnClearLogs.addEventListener("click", () => { consoleEl.innerHTML = ""; addLogLine("system-msg", "Console effac�e."); });

    btnProcess.addEventListener("click", async () => {
        if (currentMode === "bulk") await launchBulk();
        else await launchSingle();
    });

    function buildPayload() {
        let captionList = [];
        if (chkCaptions.checked && textareaCaptions.value.trim()) {
            captionList = textareaCaptions.value.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        }
        return {
            copies: parseInt(inputCopies.value, 10) || 5,
            output: inputOutputPath.value || "./output",
            exif: chkExif.checked,
            hash: chkHash.checked,
            strip_ai: chkStripAi.checked,
            hash_intensity: parseFloat(rangeIntensity.value),
            video_reencode: chkVideoReencode.checked,
            captions_enabled: chkCaptions.checked,
            font_size: parseInt(rangeFontSize.value, 10) || 32,
            font_name: selectFont.value || "arial",
            captions: captionList
        };
    }

    function lockUI() {
        btnProcess.disabled = true;
        btnBrowseFile.disabled = true;
        btnBrowseFolder.disabled = true;
        btnBrowseBulkSource.disabled = true;
        progressContainer.style.display = "block";
        progressBar.style.width = "0%";
        progressText.textContent = "Initialisation...";
        resultsArea.style.display = "none";
        resultsList.innerHTML = "";
    }

    function unlockUI() {
        btnProcess.disabled = false;
        btnBrowseFile.disabled = false;
        btnBrowseFolder.disabled = false;
        btnBrowseBulkSource.disabled = false;
    }

    async function streamProcess(url, payload) {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || "Erreur serveur"); }
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();
            for (const line of lines) { if (line.trim()) { try { handleLogData(JSON.parse(line)); } catch (e) {} } }
        }
        if (buffer.trim()) { try { handleLogData(JSON.parse(buffer)); } catch (e) {} }
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
});
