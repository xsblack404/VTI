/**
 * Enterprise Bulk Video Converter Logic
 * Handles file ingestion, canvas processing, and zip generation.
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
        this.intervalInput = document.getElementById('intervalSettings');
        this.formatInput = document.getElementById('formatSettings');
        this.qualityInput = document.getElementById('qualitySettings');

        this.initListeners();
    }

    initListeners() {
        // Drag & Drop
        this.dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropzone.classList.add('dragover');
        });

        this.dropzone.addEventListener('dragleave', () => {
            this.dropzone.classList.remove('dragover');
        });

        this.dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropzone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

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

        const interval = parseFloat(this.intervalInput.value);
        const format = this.formatInput.value;
        const quality = parseFloat(this.qualityInput.value);

        this.log('Starting batch processing...');

        for (let i = 0; i < this.files.length; i++) {
            if (this.stopRequested) break;

            const file = this.files[i];
            const statusEl = document.getElementById(`status-${i}`);
            statusEl.textContent = 'Processing...';
            statusEl.className = 'file-status status-processing';
            
            this.currentTask.textContent = `Processing ${i + 1}/${this.files.length}: ${file.name}`;

            try {
                await this.processVideo(file, interval, format, quality, i);
                statusEl.textContent = 'Done';
                statusEl.className = 'file-status status-done';
            } catch (err) {
                console.error(err);
                this.log(`Error processing ${file.name}: ${err.message}`);
                statusEl.textContent = 'Error';
                statusEl.className = 'file-status status-error';
            }
        }

        this.resetUI();
    }

    async processVideo(file, interval, format, quality, fileIndex) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;
            video.crossOrigin = "anonymous";

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const zip = new JSZip();
            const folder = zip.folder(file.name.replace(/\.[^/.]+$/, ""));

            let currentTime = 0;
            
            video.onloadedmetadata = async () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const duration = video.duration;
                
                this.log(`Processing ${file.name} (${duration.toFixed(1)}s)`);

                const processFrame = async () => {
                    if (this.stopRequested) {
                        URL.revokeObjectURL(video.src);
                        resolve();
                        return;
                    }

                    if (currentTime > duration) {
                        // Finalize Zip
                        this.log(`Zipping images for ${file.name}...`);
                        const content = await zip.generateAsync({ type: 'blob' });
                        saveAs(content, `${file.name}_frames.zip`);
                        URL.revokeObjectURL(video.src);
                        resolve();
                        return;
                    }

                    // Update Progress Bar for current file
                    const percent = Math.min(100, (currentTime / duration) * 100);
                    this.progressBar.style.width = `${percent}%`;
                    this.percentage.textContent = `${Math.round(percent)}%`;

                    video.currentTime = currentTime;
                };

                // Seek Listener
                video.onseeked = async () => {
                    // Draw Frame
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    
                    // Convert to Blob
                    const blob = await new Promise(r => canvas.toBlob(r, format, quality));
                    
                    // Add to Zip
                    const ext = format === 'image/png' ? 'png' : 'jpg';
                    const timeStr = currentTime.toFixed(2).replace('.', '_');
                    folder.file(`frame_${timeStr}.${ext}`, blob);

                    // Next Frame
                    currentTime += interval;
                    processFrame(); 
                };

                video.onerror = (e) => reject(new Error("Video load error"));

                // Start loop
                processFrame();
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
        this.progressBar.style.width = '0%';
        this.percentage.textContent = '0%';
        this.log('Batch processing finished.');
        document.getElementById('systemStatus').textContent = "Completed";
        document.getElementById('systemStatus').style.color = "#059669";
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    const app = new VideoConverter();
});
