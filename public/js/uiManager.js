import { CONFIG } from "./constants.js";

export class UIManager {
    constructor() {
        this.progressMessage = document.getElementById('progress-message');
        this.fileButton = document.getElementById('custom-file-upload');
        this.priceEstimateElement = document.getElementById('price-estimate');
        this.totalTokensElement = document.getElementById('total-tokens-estimate');
        this.totalRequestsElement = document.getElementById('total-requests-estimate');
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
                processingElementRequests.textContent = `Current Requests In Process: ${data.processingRequests}`;
            }
            if (processingElementWait) {
                processingElementWait.textContent = `Estimated Wait time: ${data.estimatedTimeRemaining} seconds`;
            }
        } catch (error) {
            console.error('Error fetching processing status:', error);
        }
    }
}
