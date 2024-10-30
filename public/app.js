import { FileHandler } from "./js/fileHandler.js";
import { PriceCalculator } from "./js/priceCalculator.js";
import { LabelManager } from "./js/labelManager.js";
import { UIManager } from "./js/uiManager.js";
import { FileUploader } from "./js/fileUploader.js";

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