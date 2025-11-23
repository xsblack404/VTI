/**
 * Enterprise Bulk Video Converter Logic
 * Supports: Interval Extraction (Multi-Zip) and Single Frame Overview (Master Zip)
 */

class VideoConverter {
    constructor() {
        this.files = [];
        this.isProcessing = false;
        this.stopRequested = false;
        
        // DOM Elements
        this.dropzone = document.getElementById('dropzone');
        this.fileInput = document.getElementById('fileInput');
        this.fileList = document.getElementById('fileList');
        this.queueContainer = document.getElementById('queueContainer');
        this.queueCount = document.getElementById('queueCount');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.progressBar = document.getElementById('progressBar');
        this.percentage = document.getElementById('percentage');
        this.currentTask = document.getElementById('currentTask');
        this.progressSection = document.getElementById('progressSection');
        this.consoleLog = document.getElementById('consoleLog');
        this.clearQueueBtn = document.getElementById('clearQueueBtn');

        // Settings
        this.modeInput = document.getElementById('modeSettings');
        this.intervalInput = document.getElementById('intervalSettings');
        this.intervalLabel = document.getElementById('intervalLabel');
        this.intervalHelp = document.getElementById('intervalHelp');
        this.formatInput = document.getElementById('formatSettings');
        this.qualityInput = document.getElementById('qualitySettings');

        this.initListeners();
    }

    initListeners() {
        // Drag & Drop
        this.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); this.dropzone.classList.add('dragover'); });
        this.dropzone.addEventListener('dragleave', () => { this.dropzone.classList.remove('dragover'); });
        this.dropzone.addEventListener('drop', (e) => { e.preventDefault(); this.dropzone.classList.remove('dragover'); this.handleFiles(e.dataTransfer.files); });

        // Click to Browse
        this.dropzone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        // Buttons
        this.startBtn.addEventListener('click', () => this.startProcessing());
        this.stopBtn.addEventListener('click', () => {
            this.stopRequested = true;
            this.log('Stop requested by user...');
            this.stopBtn.disabled = true;
        });
        this.clearQueueBtn.addEventListener('click', () => this.clearQueue());

        // Settings UI Logic
        this.modeInput.addEventListener('change', () => {
            if (this.modeInput.value === 'single') {
                this.intervalLabel.textContent = "Snapshot Time (Seconds)";
                this.intervalHelp.textContent = "Capture frame at this timestamp";
            } else {
                this.intervalLabel.textContent = "Extraction Interval (Seconds)";
                this.intervalHelp.textContent = "Extract 1 frame every X seconds";
            }
        });
    }

    handleFiles(fileList) {
        if (this.isProcessing) return;

        const newFiles = Array.from(fileList).filter(file => file.type.startsWith('video/'));
        
        if (newFiles.length === 0) {
            this.log('Error: No valid video files detected.');
            return;
        }

        this.files = [...this.files, ...newFiles];
        this.updateQueueUI();
        this.log(`Added ${newFiles.length} videos to queue.`);
    }

    updateQueueUI() {
        this.fileList.innerHTML = '';
        this.queueCount.textContent = this.files.length;
        
        if (this.files.length > 0) {
            this.queueContainer.style.display = 'block';
            this.startBtn.disabled = false;
        } else {
            this.queueContainer.style.display = 'none';
            this.startBtn.disabled = true;
        }

        this.files.forEach((file, index) => {
            const li = document.createElement('li');
            li.className = 'file-item';
            li.id = `file-${index}`;
            li.innerHTML = `
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-meta">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <span class="file-status status-pending" id="status-${index}">Pending</span>
            `;
            this.fileList.appendChild(li);
        });
    }

    clearQueue() {
        if (this.isProcessing) return;
        this.files = [];
        this.updateQueueUI();
        this.log('Queue cleared.');
    }

    log(msg) {
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        this.consoleLog.appendChild(div);
        this.consoleLog.scrollTop = this.consoleLog.scrollHeight;
    }

    async startProcessing() {
        this.isProcessing = true;
        this.stopRequested = false;
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.progressSection.style.display = 'block';
        this.dropzone.style.pointerEvents = 'none';
        this.clearQueueBtn.style.display = 'none';

        const mode = this.modeInput.value;
        const interval = parseFloat(this.intervalInput.value) || 1;
        const format = this.formatInput.value;
        const quality = parseFloat(this.qualityInput.value);

        // Initialize Master Zip if in Single Mode
        let globalZip = null;
        if (mode === 'single') {
            this.log('Mode: Single Frame Extraction. Creating Master Zip...');
            globalZip = new JSZip();
        } else {
            this.log('Mode: Interval Extraction. Creating Zip per Video...');
        }

        for (let i = 0; i < this.files.length; i++) {
            if (this.stopRequested) break;

            const file = this.files[i];
            const statusEl = document.getElementById(`status-${i}`);
            statusEl.textContent = 'Processing...';
            statusEl.className = 'file-status status-processing';
            
            this.currentTask.textContent = `Processing ${i + 1}/${this.files.length}: ${file.name}`;

            // Update Global Progress bar for Single Mode
            if (mode === 'single') {
                const percent = ((i) / this.files.length) * 100;
                this.progressBar.style.width = `${percent}%`;
                this.percentage.textContent = `${Math.round(percent)}%`;
            }

            try {
                if (mode === 'single') {
                    // Single Frame Mode
                    await this.processSingleFrame(file, interval, format, quality, globalZip);
                } else {
                    // Interval Mode
                    await this.processInterval(file, interval, format, quality);
                }

                statusEl.textContent = 'Done';
                statusEl.className = 'file-status status-done';
            } catch (err) {
                console.error(err);
                this.log(`Error processing ${file.name}: ${err.message}`);
                statusEl.textContent = 'Error';
                statusEl.className = 'file-status status-error';
            }
        }

        // Finalize
        if (!this.stopRequested && mode === 'single' && this.files.length > 0) {
            this.currentTask.textContent = "Compressing Master Zip...";
            this.log('Generating Master Zip archive...');
            const content = await globalZip.generateAsync({ type: 'blob' });
            saveAs(content, `All_Thumbnails_${new Date().getTime()}.zip`);
        }

        this.progressBar.style.width = '100%';
        this.percentage.textContent = '100%';
        this.resetUI();
    }

    // MODE 1: ONE ZIP PER VIDEO (Multiple frames)
    async processInterval(file, interval, format, quality) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const zip = new JSZip();
            const folder = zip.folder(file.name.replace(/\.[^/.]+$/, "")); // Folder inside zip

            let currentTime = 0;
            
            video.onloadedmetadata = async () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const duration = video.duration;
                
                this.log(`Reading ${file.name} (${duration.toFixed(1)}s)`);

                const processFrame = async () => {
                    if (this.stopRequested) {
                        URL.revokeObjectURL(video.src);
                        resolve();
                        return;
                    }

                    if (currentTime > duration) {
                        this.log(`Zipping ${file.name}...`);
                        const content = await zip.generateAsync({ type: 'blob' });
                        saveAs(content, `${file.name}_frames.zip`);
                        URL.revokeObjectURL(video.src);
                        resolve();
                        return;
                    }

                    const percent = Math.min(100, (currentTime / duration) * 100);
                    this.progressBar.style.width = `${percent}%`;
                    this.percentage.textContent = `${Math.round(percent)}%`;

                    video.currentTime = currentTime;
                };

                video.onseeked = async () => {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const blob = await new Promise(r => canvas.toBlob(r, format, quality));
                    
                    const ext = format === 'image/png' ? 'png' : 'jpg';
                    const timeStr = currentTime.toFixed(2).replace('.', '_');
                    folder.file(`frame_${timeStr}.${ext}`, blob);

                    currentTime += interval;
                    processFrame(); 
                };

                video.onerror = () => reject(new Error("Video load error"));
                processFrame();
            };
        });
    }

    // MODE 2: ONE ZIP FOR ALL VIDEOS (One frame each)
    async processSingleFrame(file, snapshotTime, format, quality, globalZip) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            video.onloadedmetadata = async () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                // Ensure we don't seek past the video duration
                let seekTime = snapshotTime;
                if (seekTime > video.duration) seekTime = video.duration / 2; // Fallback to middle if setting is too high

                video.currentTime = seekTime;
            };

            video.onseeked = async () => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const blob = await new Promise(r => canvas.toBlob(r, format, quality));

                const ext = format === 'image/png' ? 'png' : 'jpg';
                const safeName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
                
                // Add to master zip
                globalZip.file(`${safeName}_thumb.${ext}`, blob);
                
                URL.revokeObjectURL(video.src);
                resolve();
            };

            video.onerror = (e) => {
                URL.revokeObjectURL(video.src);
                reject(new Error("Video load error"));
            };
        });
    }

    resetUI() {
        this.isProcessing = false;
        this.stopRequested = false;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.dropzone.style.pointerEvents = 'auto';
        this.clearQueueBtn.style.display = 'block';
        this.currentTask.textContent = "Ready";
        this.log('Batch processing finished.');
        document.getElementById('systemStatus').textContent = "Completed";
        document.getElementById('systemStatus').style.color = "#059669";
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    const app = new VideoConverter();
});
