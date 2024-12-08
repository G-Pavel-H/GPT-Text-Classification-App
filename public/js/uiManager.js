import { CONFIG } from "./constants.js";

export class UIManager {
    constructor() {
        this.progressMessage = document.getElementById('progress-message');
        this.fileButton = document.getElementById('custom-file-upload');
        this.priceEstimateElement = document.getElementById('price-estimate');
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

    animateValue(element, start, end) {
        let startTimestamp = null;
        
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = timestamp - startTimestamp;
            const current = Math.min(start + (end - start) * (progress / CONFIG.ANIMATION_DURATION), end);
            element.textContent = '$' + current.toFixed(4);
            
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
    }

    updateFileButton(fileName) {
        this.fileButton.textContent = fileName || 'Choose File'; // Default text if no filename
    }

    resetFileInput() {
        this.updateFileButton('Choose File');
        this.resetPriceEstimate();
    }
}
