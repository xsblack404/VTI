/**
 * Enterprise Bulk Video Processor Logic
 * Key Features:
 * 1. Master Zip Mode: Accumulates one frame per video into a single downloadable file.
 * 2. Interval Mode: Creates individual zips per video with multiple frames.
 * 3. Asynchronous Queue: Prevents browser freezing.
 */

class VideoConverter {
    constructor() {
        this.files = [];
        this.isProcessing = false;
        this.stopRequested = false;
        
        // UI References
        this.ui = {
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

        this.init();
    }

    init() {
        // Drag and Drop
        this.ui.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); this.ui.dropzone.classList.add('dragover'); });
        this.ui.dropzone.addEventListener('dragleave', () => this.ui.dropzone.classList.remove('dragover'));
        this.ui.dropzone.addEventListener('drop', (e) => { e.preventDefault(); this.ui.dropzone.classList.remove('dragover'); this.handleFiles(e.dataTransfer.files); });
        
        // File Input
        this.ui.dropzone.addEventListener('click', () => this.ui.fileInput.click());
        this.ui.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        // Controls
        this.ui.startBtn.addEventListener('click', () => this.startProcessing());
        this.ui.stopBtn.addEventListener('click', () => { this.stopRequested = true; this.log('Stop requested...'); });
        this.ui.clearQueueBtn.addEventListener('click', () => this.clearQueue());

        // Settings UI Toggles
        this.ui.mode.addEventListener('change', () => {
            if (this.ui.mode.value === 'single') {
                this.ui.intervalLabel.textContent = "Snapshot Timestamp (Seconds)";
                this.ui.intervalHelp.textContent = "Example: Type '5' to take a thumbnail at 00:05";
            } else {
                this.ui.intervalLabel.textContent = "Extraction Interval (Seconds)";
                this.ui.intervalHelp.textContent = "Extracts a frame every X seconds";
            }
        });
    }

    handleFiles(fileList) {
        if (this.isProcessing) return;
        const validFiles = Array.from(fileList).filter(f => f.type.startsWith('video/'));
        if (validFiles.length === 0) return this.log('Error: No video files found.');

        this.files = [...this.files, ...validFiles];
        this.renderQueue();
        this.log(`Added ${validFiles.length} videos to queue.`);
    }

    renderQueue() {
        this.ui.fileList.innerHTML = '';
        this.ui.queueCount.textContent = this.files.length;
        this.ui.queueContainer.style.display = this.files.length ? 'block' : 'none';
        this.ui.startBtn.disabled = this.files.length === 0;

        this.files.forEach((file, i) => {
            const li = document.createElement('li');
            li.className = 'file-item';
            li.innerHTML = `
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-meta">${(file.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
                <span class="file-status status-pending" id="status-${i}">Pending</span>
            `;
            this.ui.fileList.appendChild(li);
        });
    }

    clearQueue() {
        if (this.isProcessing) return;
        this.files = [];
        this.renderQueue();
        this.log('Queue cleared.');
    }

    log(msg) {
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        this.ui.consoleLog.appendChild(div);
        this.ui.consoleLog.scrollTop = this.ui.consoleLog.scrollHeight;
    }

    toggleUI(processing) {
        this.isProcessing = processing;
        this.ui.startBtn.disabled = processing;
        this.ui.stopBtn.disabled = !processing;
        this.ui.dropzone.style.pointerEvents = processing ? 'none' : 'auto';
        this.ui.clearQueueBtn.style.display = processing ? 'none' : 'block';
        this.ui.progressSection.style.display = processing ? 'block' : 'none';
        this.ui.statusBadge.textContent = processing ? "Processing..." : "Idle";
        this.ui.statusBadge.style.color = processing ? "#4f46e5" : "#64748b";
    }

    async startProcessing() {
        this.stopRequested = false;
        this.toggleUI(true);
        
        const mode = this.ui.mode.value;
        const settings = {
            interval: parseFloat(this.ui.interval.value) || 1,
            format: this.ui.format.value,
            quality: parseFloat(this.ui.quality.value)
        };

        // MASTER ZIP LOGIC: Create ONE zip instance for the entire batch
        let masterZip = null;
        if (mode === 'single') {
            this.log('Mode: Single Frame. Initializing Master Zip archive...');
            masterZip = new JSZip();
        } else {
            this.log('Mode: Interval. Each video will produce its own Zip.');
        }

        // Main Loop
        for (let i = 0; i < this.files.length; i++) {
            if (this.stopRequested) break;

            const file = this.files[i];
            const statusEl = document.getElementById(`status-${i}`);
            
            statusEl.textContent = 'Processing...';
            statusEl.className = 'file-status status-pending'; // Blue color via css if needed
            this.ui.currentTask.textContent = `Processing [${i+1}/${this.files.length}]: ${file.name}`;

            // Update Global Bar for Single Mode
            if (mode === 'single') {
                const pct = Math.round((i / this.files.length) * 100);
                this.ui.progressBar.style.width = `${pct}%`;
                this.ui.percentage.textContent = `${pct}%`;
            }

            try {
                if (mode === 'single') {
                    // Pass the masterZip to the function to append the file
                    await this.processSingleFrame(file, settings, masterZip, i);
                } else {
                    await this.processInterval(file, settings);
                }
                
                statusEl.textContent = 'Done';
                statusEl.className = 'file-status status-done';
            } catch (err) {
                console.error(err);
                this.log(`Error on ${file.name}: ${err.message}`);
                statusEl.textContent = 'Error';
                statusEl.className = 'file-status status-error';
            }
        }

        // FINALIZE MASTER ZIP
        if (mode === 'single' && !this.stopRequested && this.files.length > 0) {
            this.ui.currentTask.textContent = "Compressing Master Zip... (This may take a moment)";
            this.ui.progressBar.style.width = '100%';
            this.ui.percentage.textContent = 'Compressing...';
            
            try {
                const content = await masterZip.generateAsync({ type: 'blob' });
                const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,"-");
                saveAs(content, `Batch_Thumbnails_${timestamp}.zip`);
                this.log('Master Zip downloaded successfully.');
            } catch (e) {
                this.log('Error generating zip: ' + e.message);
            }
        }

        this.log('All operations completed.');
        this.toggleUI(false);
        this.ui.currentTask.textContent = "Ready";
        this.ui.progressBar.style.width = '0%';
        this.ui.percentage.textContent = '0%';
    }

    /**
     * SINGLE MODE: Extracts 1 frame and adds to masterZip
     */
    processSingleFrame(file, settings, zipInstance, index) {
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
                
                // Logic: If requested time is longer than video, take the middle frame
                let seekTime = settings.interval;
                if (seekTime > video.duration) seekTime = video.duration / 2;

                video.currentTime = seekTime;
            };

            video.onseeked = async () => {
                try {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const blob = await new Promise(r => canvas.toBlob(r, settings.format, settings.quality));
                    
                    // Filename handling (Handle duplicates by appending index)
                    const ext = settings.format === 'image/png' ? 'png' : 'jpg';
                    const cleanName = file.name.replace(/\.[^/.]+$/, "");
                    // Adding index ensures uniqueness in the zip if user uploads files with same name
                    const finalName = `${cleanName}_${index}.${ext}`;

                    zipInstance.file(finalName, blob);
                    
                    URL.revokeObjectURL(video.src);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            };

            video.onerror = () => {
                URL.revokeObjectURL(video.src);
                reject(new Error("Could not load video data"));
            };
        });
    }

    /**
     * INTERVAL MODE: Extracts many frames, creates 1 Zip per Video immediately
     */
    processInterval(file, settings) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Local Zip for this specific video
            const localZip = new JSZip();
            const folder = localZip.folder(file.name.replace(/\.[^/.]+$/, ""));
            
            let currentTime = 0;

            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                const processFrame = async () => {
                    if (this.stopRequested) {
                        URL.revokeObjectURL(video.src);
                        resolve();
                        return;
                    }

                    if (currentTime > video.duration) {
                        // Done with this video, generate its specific zip
                        const content = await localZip.generateAsync({ type: 'blob' });
                        saveAs(content, `${file.name}_frames.zip`);
                        URL.revokeObjectURL(video.src);
                        resolve();
                        return;
                    }

                    // UI Update for specific file progress
                    const pct = (currentTime / video.duration) * 100;
                    this.ui.progressBar.style.width = `${pct}%`;
                    this.ui.percentage.textContent = `${Math.round(pct)}%`;

                    video.currentTime = currentTime;
                };

                video.onseeked = async () => {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const blob = await new Promise(r => canvas.toBlob(r, settings.format, settings.quality));
                    
                    const ext = settings.format === 'image/png' ? 'png' : 'jpg';
                    const timeStr = currentTime.toFixed(2).replace('.', '_');
                    folder.file(`frame_${timeStr}.${ext}`, blob);

                    currentTime += settings.interval;
                    processFrame();
                };

                video.onerror = () => reject(new Error("Video playback error"));
                
                // Start loop
                processFrame();
            };
        });
    }
}

// Boot
document.addEventListener('DOMContentLoaded', () => new VideoConverter());
