// Constants
const CONFIG = {
    MAX_LABEL_COUNT: 8,
    LABEL_MAX_LENGTH: 5,
    MAX_ALLOWED_PRICE: 0.1,
    ANIMATION_DURATION: 1000
};

class FileHandler {
    constructor() {
        this.isValid = false;
        this.selectedFile = null;
    }

    validateFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                const rows = text.split('\n').filter(row => row.trim() !== '');
                const header = rows[0].split(',');
                const inputColumnIndex = header.findIndex(col => 
                    col.trim().toLowerCase() === 'input'
                );
    
                if (inputColumnIndex === -1) {
                    this.isValid = false;
                    this.selectedFile = null;
                    reject(new Error('CSV file must contain a column named "Input".')); // Changed this line
                    return;
                }
                
                this.isValid = true;
                this.selectedFile = file;
                resolve(true);
            };
            reader.readAsText(file);
        });
    }

    reset() {
        this.isValid = false;
        this.selectedFile = null;
    }
}

// Price Calculator Class
class PriceCalculator {
    constructor() {
        this.isValid = false;
    }

    async calculatePrice(file, model) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', model);

        try {
            const response = await fetch('/calculate-cost', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Error calculating token count.');
            }

            const data = await response.json();
            this.isValid = data.totalCost <= CONFIG.MAX_ALLOWED_PRICE;
            
            return {
                totalCost: data.totalCost,
                isValid: this.isValid,
                error: this.isValid ? null : `File is too large, exceeded price limit of $${CONFIG.MAX_ALLOWED_PRICE}`
            };
        } catch (error) {
            throw new Error('An error occurred while calculating token count.');
        }
    }

    reset() {
        this.isValid = false;
    }
}

// Label Manager Class
class LabelManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
    }

    addLabel() {
        const labels = this.container.querySelectorAll('.label');
        
        if (labels.length >= CONFIG.MAX_LABEL_COUNT) {
            throw new Error(`No more labels can be added, maximum is ${CONFIG.MAX_LABEL_COUNT}`);
        }

        if (labels.length === 2) {
            this.addDeleteButtonsToExistingLabels(labels);
        }

        const newLabel = this.createLabelElement();
        this.container.appendChild(newLabel);
    }

    createLabelElement() {
        const newLabel = document.createElement('div');
        newLabel.classList.add('label');
        
        newLabel.innerHTML = `
            <input type="text" placeholder="Label Name" class="label-name" maxlength="${CONFIG.LABEL_MAX_LENGTH}">
            <input type="text" placeholder="Label Definition" class="label-definition" maxlength="${CONFIG.LABEL_MAX_LENGTH}">
        `;

        const deleteButton = this.createDeleteButton();
        newLabel.appendChild(deleteButton);
        
        return newLabel;
    }

    createDeleteButton() {
        const deleteButton = document.createElement('button');
        deleteButton.className = 'remove-label';
        deleteButton.textContent = '×';
        deleteButton.onclick = (e) => this.removeLabel(e.target);
        return deleteButton;
    }

    removeLabel(button) {
        const label = button.parentElement;
        this.container.removeChild(label);

        const labels = this.container.querySelectorAll('.label');
        if (labels.length === 2) {
            labels.forEach(label => {
                const deleteButton = label.querySelector('.remove-label');
                if (deleteButton) {
                    label.removeChild(deleteButton);
                }
            });
        }
    }

    addDeleteButtonsToExistingLabels(labels) {
        labels.forEach(label => {
            if (!label.querySelector('.remove-label')) {
                const deleteButton = this.createDeleteButton();
                label.appendChild(deleteButton);
            }
        });
    }

    validateLabels() {
        const labelElements = this.container.querySelectorAll('.label');
        const labels = Array.from(labelElements).map(labelElement => {
            const nameInput = labelElement.querySelector('.label-name');
            const definitionInput = labelElement.querySelector('.label-definition');
            
            return {
                name: nameInput.value.trim(),
                definition: definitionInput.value.trim()
            };
        });

        if (labels.length === 0) {
            throw new Error('Please add at least one Label.');
        }

        if (labels.some(label => label.name === '' || label.definition === '')) {
            throw new Error('Please fill in all Label names and definitions.');
        }

        if (labels.some(label => 
            label.name.length > CONFIG.LABEL_MAX_LENGTH || 
            label.definition.length > CONFIG.LABEL_MAX_LENGTH)) {
            throw new Error(`Label has exceeded the limit of characters - ${CONFIG.LABEL_MAX_LENGTH}.`);
        }

        return labels;
    }
}

// UI Manager Class
class UIManager {
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

// File Uploader Class
class FileUploader {
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    async uploadFile(file, labels, model) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('labels', JSON.stringify(labels));
        formData.append('model', model);

        this.uiManager.updateProgressMessage('Processing your file, please wait...');

        try {
            const response = await fetch('/upload-csv', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Error generating output file.' }));
                throw new Error(errorData.message || 'Error generating output file.');
            }

            this.uiManager.updateProgressMessage('Download will start shortly...');
            
            const blob = await response.blob();
            this.downloadFile(blob);
            
            this.uiManager.updateProgressMessage('', false);
        } catch (error) {
            this.uiManager.updateProgressMessage('', false);
            throw error; // Re-throw the error to be handled by the caller
        }
    }

    downloadFile(blob) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'categorized-output.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
}

// Main Application Class
class App {
    constructor() {
        this.fileHandler = new FileHandler();
        this.priceCalculator = new PriceCalculator();
        this.labelManager = new LabelManager('labels-container');
        this.uiManager = new UIManager();
        this.fileUploader = new FileUploader(this.uiManager);
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.initializeMouseMove();
            this.initializeFileInput();
            this.initializeModelChangeListeners();
            this.initializePreloader();
        });
    }

    initializeMouseMove() {
        document.addEventListener('mousemove', (e) => {
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            document.body.style.setProperty('--mouse-x', x + '%');
            document.body.style.setProperty('--mouse-y', y + '%');
        });
    }

    initializeModelChangeListeners() {
        const modelRadioButtons = document.querySelectorAll('input[name="model"]');
        modelRadioButtons.forEach(radio => {
            radio.addEventListener('change', () => {
                if (this.fileHandler.selectedFile && this.fileHandler.isValid) {
                    this.handlePriceCalculation(this.fileHandler.selectedFile);
                }
            });
        });
    }

    initializePreloader() {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const preloader = document.getElementById('preloader');
                preloader.style.opacity = '0';
                preloader.style.transition = 'opacity 1s ease';

                setTimeout(() => {
                    preloader.style.display = 'none';
                }, 1000);
            }, 1000);
        });
    }

    initializeFileInput() {
        const fileInput = document.getElementById('csvFileInput');
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            if (!file) {
                this.resetState();
                return;
            }
    
            try {
                await this.fileHandler.validateFile(file);
                this.uiManager.updateFileButton(file.name);
                await this.handlePriceCalculation(file);
            } catch (error) {
                this.handleFileError(error.message);
                fileInput.value = ''; // Add this line to clear the file input
            }
        });
    }

    handleFileError(errorMessage) {
        this.resetState();
        this.uiManager.showAlert(errorMessage);
    }

    resetState() {
        this.fileHandler.reset();
        this.priceCalculator.reset();
        this.uiManager.resetFileInput();
    }

    async handlePriceCalculation(file) {
        try {
            const model = document.querySelector('input[name="model"]:checked').value;
            const priceResult = await this.priceCalculator.calculatePrice(file, model);
            
            const priceEstimateElement = document.getElementById('price-estimate');
            this.uiManager.animateValue(priceEstimateElement, 0, priceResult.totalCost);

            if (!priceResult.isValid) {
                this.handleFileError(priceResult.error);
            }
        } catch (error) {
            this.handleFileError(error.message);
        }
    }

    async handleUpload() {
        if (!this.fileHandler.isValid) {
            this.uiManager.showAlert('Please upload a valid CSV file.');
            return;
        }
    
        if (!this.priceCalculator.isValid) {
            this.uiManager.showAlert(`File is too large, exceeded price limit of $${CONFIG.MAX_ALLOWED_PRICE}`);
            return;
        }
    
        try {
            const labels = this.labelManager.validateLabels();
            const model = document.querySelector('input[name="model"]:checked').value;
            await this.fileUploader.uploadFile(this.fileHandler.selectedFile, labels, model);
        } catch (error) {
            this.uiManager.showAlert(error.message);
            this.uiManager.updateProgressMessage('', false);
            // Reset file input to allow re-upload
            const fileInput = document.getElementById('csvFileInput');
            fileInput.value = '';
            this.resetState();
        }
    }
}

// Initialize the application
const app = new App();

// Expose necessary functions to global scope
window.addLabel = () => {
    try {
        app.labelManager.addLabel();
    } catch (error) {
        app.uiManager.showAlert(error.message);
    }
};

window.uploadFile = () => app.handleUpload();