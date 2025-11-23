/**
 * Enterprise Bulk Video Processor Logic
 * FIXED: Strict separation of saving logic between "Single" and "Interval" modes.
 */

class VideoConverter {
    constructor() {
        this.files = [];
        this.isProcessing = false;
        this.stopRequested = false;
        
        // DOM Elements References
        this.dom = {
            dropzone: document.getElementById('dropzone'),
            fileInput: document.getElementById('fileInput'),
            fileList: document.getElementById('fileList'),
            queueContainer: document.getElementById('queueContainer'),
            queueCount: document.getElementById('queueCount'),
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            progressBar: document.getElementById('progressBar'),
            percentage: document.getElementById('percentage'),
            currentTask: document.getElementById('currentTask'),
            progressSection: document.getElementById('progressSection'),
            consoleLog: document.getElementById('consoleLog'),
            clearQueueBtn: document.getElementById('clearQueueBtn'),
            statusBadge: document.getElementById('systemStatus'),
            // Settings
            mode: document.getElementById('modeSettings'),
            interval: document.getElementById('intervalSettings'),
            intervalLabel: document.getElementById('intervalLabel'),
            intervalHelp: document.getElementById('intervalHelp'),
            format: document.getElementById('formatSettings'),
            quality: document.getElementById('qualitySettings')
        };

        this.initListeners();
    }

    initListeners() {
        // Drag & Drop
        this.dom.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); this.dom.dropzone.classList.add('dragover'); });
        this.dom.dropzone.addEventListener('dragleave', () => this.dom.dropzone.classList.remove('dragover'));
        this.dom.dropzone.addEventListener('drop', (e) => { e.preventDefault(); this.dom.dropzone.classList.remove('dragover'); this.handleFiles(e.dataTransfer.files); });
        
        // Inputs
        this.dom.dropzone.addEventListener('click', () => this.dom.fileInput.click());
        this.dom.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        // Buttons
        this.dom.startBtn.addEventListener('click', () => this.startProcessing());
        this.dom.stopBtn.addEventListener('click', () => { this.stopRequested = true; this.log('Stop requested by user...'); });
        this.dom.clearQueueBtn.addEventListener('click', () => this.clearQueue());

        // UI Label Toggles
        this.dom.mode.addEventListener('change', () => {
            const isSingle = this.dom.mode.value === 'single';
            this.dom.intervalLabel.textContent = isSingle ? "Snapshot Timestamp (sec)" : "Extraction Interval (sec)";
            this.dom.intervalHelp.textContent = isSingle ? "Time to take the thumbnail" : "Extracts a frame every X seconds";
        });
    }

    handleFiles(fileList) {
        if (this.isProcessing) return;
        const validFiles = Array.from(fileList).filter(f => f.type.startsWith('video/'));
        if (!validFiles.length) return this.log('Error: No video files detected.');

        this.files = [...this.files, ...validFiles];
        this.updateQueue();
        this.log(`Added ${validFiles.length} videos.`);
    }

    updateQueue() {
        this.dom.fileList.innerHTML = '';
        this.dom.queueCount.textContent = this.files.length;
        this.dom.queueContainer.style.display = this.files.length ? 'block' : 'none';
        this.dom.startBtn.disabled = this.files.length === 0;

        this.files.forEach((file, i) => {
            const li = document.createElement('li');
            li.className = 'file-item';
            li.innerHTML = `
                <div class="file-info"><span class="file-name">${file.name}</span></div>
                <span class="file-status status-pending" id="status-${i}">Pending</span>
            `;
            this.dom.fileList.appendChild(li);
        });
    }

    clearQueue() {
        if (this.isProcessing) return;
        this.files = [];
        this.updateQueue();
        this.log('Queue cleared.');
    }

    log(msg) {
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        this.dom.consoleLog.appendChild(div);
        this.dom.consoleLog.scrollTop = this.dom.consoleLog.scrollHeight;
    }

    setProcessingState(active) {
        this.isProcessing = active;
        this.dom.startBtn.disabled = active;
        this.dom.stopBtn.disabled = !active;
        this.dom.clearQueueBtn.style.display = active ? 'none' : 'block';
        this.dom.progressSection.style.display = active ? 'block' : 'none';
        this.dom.dropzone.style.pointerEvents = active ? 'none' : 'auto';
        this.dom.statusBadge.innerText = active ? "Processing..." : "Ready";
        this.dom.statusBadge.style.color = active ? "#4f46e5" : "#64748b";
    }

    // ==========================================
    // CORE PROCESSING LOGIC
    // ==========================================
    async startProcessing() {
        this.stopRequested = false;
        this.setProcessingState(true);

        // 1. CAPTURE SETTINGS AT MOMENT OF CLICK
        const MODE = this.dom.mode.value; // 'single' or 'interval'
        const INTERVAL = parseFloat(this.dom.interval.value) || 1;
        const FORMAT = this.dom.format.value;
        const QUALITY = parseFloat(this.dom.quality.value);

        this.log(`Starting Process. Mode: ${MODE.toUpperCase()}`);

        // 2. INITIALIZE MASTER ZIP ONLY IF IN SINGLE MODE
        let masterZip = null;
        if (MODE === 'single') {
            masterZip = new JSZip();
        }

        // 3. PROCESS LOOP
        for (let i = 0; i < this.files.length; i++) {
            if (this.stopRequested) break;

            const file = this.files[i];
            const statusEl = document.getElementById(`status-${i}`);
            
            // UI Updates
            statusEl.innerText = 'Processing...';
            statusEl.className = 'file-status status-pending'; // Blue
            this.dom.currentTask.innerText = `Processing ${i + 1}/${this.files.length}: ${file.name}`;
            
            // Update Bar: In Single mode, bar is total files. In Interval, bar is handled inside the function.
            if (MODE === 'single') {
                const pct = Math.round((i / this.files.length) * 100);
                this.dom.progressBar.style.width = `${pct}%`;
                this.dom.percentage.innerText = `${pct}%`;
            }

            try {
                // STRICT BRANCHING
                if (MODE === 'single') {
                    // Logic: Extract 1 frame -> Add to Master Zip -> Do NOT save yet
                    await this.processSingleFrame(file, masterZip, INTERVAL, FORMAT, QUALITY, i);
                } else {
                    // Logic: Extract N frames -> Create Zip -> Save Immediately
                    await this.processInterval(file, INTERVAL, FORMAT, QUALITY);
                }

                statusEl.innerText = 'Done';
                statusEl.className = 'file-status status-done'; // Green
            } catch (err) {
                console.error(err);
                this.log(`Error: ${file.name} - ${err.message}`);
                statusEl.innerText = 'Error';
                statusEl.className = 'file-status status-error'; // Red
            }
        }

        // 4. FINAL SAVE (ONLY FOR SINGLE MODE)
        if (MODE === 'single' && !this.stopRequested && this.files.length > 0) {
            this.dom.currentTask.innerText = "Compressing Master Archive...";
            this.dom.progressBar.style.width = '100%';
            this.dom.percentage.innerText = 'Zipping...';
            
            try {
                const content = await masterZip.generateAsync({ type: 'blob' });
                const date = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
                saveAs(content, `Thumbnails_Master_${date}.zip`);
                this.log('Master zip downloaded.');
            } catch (e) {
                this.log('Compression Error: ' + e.message);
            }
        }

        // Cleanup
        this.setProcessingState(false);
        this.dom.progressBar.style.width = '0%';
        this.dom.percentage.innerText = '0%';
        this.dom.currentTask.innerText = "Ready";
        this.log('Job completed.');
    }

    /**
     * MODE A: Single Frame
     * Adds to the passed zipInstance, does NOT trigger saveAs
     */
    processSingleFrame(file, zipInstance, timePoint, format, quality, index) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                // Safety check: don't seek past end
                video.currentTime = (timePoint > video.duration) ? 0 : timePoint;
            };

            video.onseeked = async () => {
                try {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const blob = await new Promise(r => canvas.toBlob(r, format, quality));
                    
                    const ext = format === 'image/png' ? 'png' : 'jpg';
                    // Unique filename: Name_Index.ext
                    const filename = `${file.name.replace(/\.[^/.]+$/, "")}_${index}.${ext}`;
                    
                    zipInstance.file(filename, blob);
                    
                    URL.revokeObjectURL(video.src);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            };

            video.onerror = () => {
                URL.revokeObjectURL(video.src);
                reject(new Error("Video load failed"));
            };
        });
    }

    /**
     * MODE B: Interval Extraction
     * Creates local zip, extracts all frames, SAVES immediately
     */
    processInterval(file, interval, format, quality) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const localZip = new JSZip();
            const folder = localZip.folder(file.name.replace(/\.[^/.]+$/, ""));

            let currentTime = 0;

            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                this.processIntervalStep(video, canvas, ctx, localZip, folder, currentTime, interval, format, quality, resolve, file.name);
            };

            video.onerror = () => {
                URL.revokeObjectURL(video.src);
                reject(new Error("Video load failed"));
            };
        });
    }

    // Helper for recursive interval loop
    processIntervalStep(video, canvas, ctx, zip, folder, time, interval, format, quality, resolve, originalName) {
        if (this.stopRequested) {
            URL.revokeObjectURL(video.src);
            resolve();
            return;
        }

        if (time > video.duration) {
            // FINISHED THIS VIDEO -> GENERATE AND SAVE
            zip.generateAsync({ type: 'blob' }).then((content) => {
                saveAs(content, `${originalName}_frames.zip`);
                URL.revokeObjectURL(video.src);
                resolve();
            });
            return;
        }

        // Progress for specific file
        const pct = Math.round((time / video.duration) * 100);
        this.dom.progressBar.style.width = `${pct}%`;
        this.dom.percentage.innerText = `${pct}%`;

        video.currentTime = time;
        
        video.onseeked = async () => {
            // Remove listener to prevent stacking
            video.onseeked = null;

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise(r => canvas.toBlob(r, format, quality));
            
            const ext = format === 'image/png' ? 'png' : 'jpg';
            folder.file(`frame_${time.toFixed(2).replace('.','_')}.${ext}`, blob);

            // Next Step
            this.processIntervalStep(video, canvas, ctx, zip, folder, time + interval, interval, format, quality, resolve, originalName);
        };
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => new VideoConverter());
