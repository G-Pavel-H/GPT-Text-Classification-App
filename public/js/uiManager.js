import { CONFIG } from "./constants.js";
import {UserIdentifier} from "./UserIdentifier.js";

export class UIManager {
    constructor() {
        this.progressMessage = document.getElementById('progress-message');
        this.fileButton = document.getElementById('custom-file-upload');
        this.priceEstimateElement = document.getElementById('price-estimate');
        this.totalTokensElement = document.getElementById('total-tokens-estimate');
        this.totalRequestsElement = document.getElementById('total-requests-estimate');
        this.progressInterval = null;
        this.progressContainer = document.getElementById('progress-container');
        this.loadingBar = document.getElementById('loading-bar');
        this.percentageOverlay = document.getElementById('percentage-overlay');
        this.lastProgressUpdate = 0;
        this.minProgressUpdateInterval = 100;
    }

    showAlert(message) {
        const modal = document.getElementById('custom-alert');
        const messageElement = document.getElementById('custom-alert-message');
        const closeBtn = document.querySelector('.custom-alert-close');
    
        if (!message) return; // Add this line to prevent empty alerts
        
        messageElement.textContent = message;
        modal.style.display = 'block';
    
        closeBtn.onclick = () => modal.style.display = 'none';
        window.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    animateValue(element, start, end, text=null) {
        let startTimestamp = null;
        
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = timestamp - startTimestamp;
            const current = Math.min(start + (end - start) * (progress / CONFIG.ANIMATION_DURATION), end);
            if(text === null){
                element.textContent = '$' + current.toFixed(8);
            }
            else{
                element.textContent = text + current.toFixed(0);
            }
            
            if (progress < CONFIG.ANIMATION_DURATION) {
                window.requestAnimationFrame(step);
            }
        };
        
        window.requestAnimationFrame(step);
    }

    updateProgressMessage(message, show = true) {
        this.progressMessage.style.display = show ? 'block' : 'none';
        this.progressMessage.textContent = message;
    }

    resetPriceEstimate() {
        this.priceEstimateElement.textContent = '$0.00';
        this.totalTokensElement.textContent = `Number of tokens for Your file: 0`;
        this.totalRequestsElement.textContent = `Number of requests for Your file: 0`;
    }

    updateFileButton(fileName) {
        this.fileButton.textContent = fileName || 'Choose File'; // Default text if no filename
    }

    resetFileInput() {
        this.updateFileButton('Choose File');
        this.resetPriceEstimate();
    }

    disableProcessButton() {
        const processButton = document.getElementById('process-file-button');
        if (processButton) {
            processButton.disabled = true;
            processButton.classList.add('disabled');
        }
    }

    enableProcessButton() {
        const processButton = document.getElementById('process-file-button');
        if (processButton) {
            processButton.disabled = false;
            processButton.classList.remove('disabled');
        }
    }



    startProgressTracking(model) {
        this.progressContainer.style.display = 'block';
        this.loadingBar.style.width = '0%';
        this.percentageOverlay.textContent = '0%';

        let firstTry = true;

        const userIdentifier = new UserIdentifier();
        userIdentifier.getUserId().then((userId) => {

            this.progressInterval = setInterval(async () => {
                const now = Date.now();
                if (now - this.lastProgressUpdate < this.minProgressUpdateInterval) {
                    return;
                }

                try {
                    const response = await fetch(`/processing-progress?model=${model}&userId=${userId}`);
                    const progress = await response.json();

                    this.lastProgressUpdate = now;

                    // Update the progress bar
                    this.loadingBar.style.width = `${progress.percentComplete}%`;
                    this.percentageOverlay.textContent = `${progress.percentComplete}%`;

                    // Check if processing is complete
                    if (!progress.processingActive && !firstTry) {
                        // If processing is not active, we're done - set to 100% and stop tracking
                        await this.stopProgressTracking();
                    }

                    firstTry = false;

                } catch (error) {
                    console.error('Error updating progress:', error);
                    await this.stopProgressTracking();
                }
            }, 200);

        });
    }

    async stopProgressTracking() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;

            // Set to 100% when stopping
            this.loadingBar.style.width = '100%';
            this.percentageOverlay.textContent = '100%';

            // Hide the progress container with a delay
            setTimeout(() => {
                this.progressContainer.style.display = 'none';
                this.loadingBar.style.width = '0%';
                this.percentageOverlay.textContent = '0%';
            }, 1000);
        }
    }

    // You might also want to add a method to track processing time
    async updateProcessingStatus(model) {
        try {
            const response = await fetch(`/processing-requests?model=${model}`);
            const data = await response.json();

            const processingElementModel = document.getElementById('processing-status-model');
            const processingElementRequests = document.getElementById('processing-status-requests');
            const processingElementWait = document.getElementById('processing-status-wait');

            if (processingElementModel) {
                processingElementModel.textContent = `Model: ${model}`;
            }
            if (processingElementRequests) {
                processingElementRequests.textContent = `Current Requests In Process:: ${data.processingRequests}`;
            }
            if (processingElementWait) {
                processingElementWait.textContent = `Estimated Wait time: : ${data.estimatedTimeRemaining} seconds`;
            }
        } catch (error) {
            console.error('Error fetching processing status:', error);
        }
    }
}
