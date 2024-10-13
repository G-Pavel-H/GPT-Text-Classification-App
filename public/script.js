// Constants
const API_ENDPOINTS = {
    UPLOAD_CSV: '/upload-csv',
  };
  
  const PRICING = {
    TOKENS_PER_INPUT: 50,
    PRICE_PER_THOUSAND_TOKENS: 0.0015,
  };
  
  // Utility functions
  class DOMUtils {
    static getElementById(id) {
      return document.getElementById(id);
    }
  
    static querySelector(selector) {
      return document.querySelector(selector);
    }
  
    static querySelectorAll(selector) {
      return document.querySelectorAll(selector);
    }
  
    static createElement(tag) {
      return document.createElement(tag);
    }
  }
  
  class AlertManager {
    static showCustomAlert(message) {
      const modal = DOMUtils.getElementById('custom-alert');
      const messageElement = DOMUtils.getElementById('custom-alert-message');
      const closeBtn = DOMUtils.querySelector('.custom-alert-close');
  
      messageElement.textContent = message;
      modal.style.display = 'block';
  
      closeBtn.onclick = () => {
        modal.style.display = 'none';
      };
  
      window.onclick = (event) => {
        if (event.target == modal) {
          modal.style.display = 'none';
        }
      };
    }
  }
  
  class PriceCalculator {
    static calculatePrice(numInputs) {
      const totalTokens = numInputs * PRICING.TOKENS_PER_INPUT;
      return (totalTokens / 1000) * PRICING.PRICE_PER_THOUSAND_TOKENS;
    }
  
    static animateValue(element, start, end, duration) {
      let startTimestamp = null;
      const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = timestamp - startTimestamp;
        const current = Math.min(start + (end - start) * (progress / duration), end);
        element.textContent = '$' + current.toFixed(4);
        if (progress < duration) {
          window.requestAnimationFrame(step);
        }
      };
      window.requestAnimationFrame(step);
    }
  }
  
  class FileValidator {
    static validateCSV(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target.result;
          const rows = text.split('\n').filter(row => row.trim() !== '');
          const header = rows[0].split(',');
          const inputColumnIndex = header.findIndex(col => col.trim().toLowerCase() === 'input');
  
          if (inputColumnIndex === -1) {
            reject('CSV file must contain a column named "Input".');
          } else if (rows.length <= 1) {
            reject('No data found in the "Input" column.');
          } else {
            resolve(rows.length - 1); // Number of inputs (excluding header)
          }
        };
        reader.readAsText(file);
      });
    }
  }
  
  class LabelManager {
    constructor() {
      this.container = DOMUtils.getElementById('labels-container');
    }
  
    addLabel() {
      const labels = this.container.querySelectorAll('.label');
  
      if (labels.length === 1) {
        this.addDeleteButton(labels[0]);
      }
  
      const newLabel = this.createLabelElement();
      this.container.appendChild(newLabel);
    }
  
    removeLabel(button) {
      const label = button.parentElement;
      this.container.removeChild(label);
  
      const labels = this.container.querySelectorAll('.label');
      if (labels.length === 1) {
        this.removeDeleteButton(labels[0]);
      }
    }
  
    createLabelElement() {
      const newLabel = DOMUtils.createElement('div');
      newLabel.classList.add('label');
      newLabel.innerHTML = `
        <input type="text" placeholder="Label Name" class="label-name">
        <input type="text" placeholder="Label Definition" class="label-definition">
      `;
      this.addDeleteButton(newLabel);
      return newLabel;
    }
  
    addDeleteButton(label) {
      const deleteButton = DOMUtils.createElement('button');
      deleteButton.className = 'remove-label';
      deleteButton.textContent = '×';
      deleteButton.onclick = () => this.removeLabel(deleteButton);
      label.appendChild(deleteButton);
    }
  
    removeDeleteButton(label) {
      const deleteButton = label.querySelector('.remove-label');
      if (deleteButton) {
        label.removeChild(deleteButton);
      }
    }
  
    getLabels() {
      return Array.from(this.container.querySelectorAll('.label')).map(labelElement => {
        const nameInput = labelElement.querySelector('.label-name');
        const definitionInput = labelElement.querySelector('.label-definition');
        return {
          name: nameInput.value.trim(),
          definition: definitionInput.value.trim()
        };
      }).filter(label => label.name !== '' && label.definition !== '');
    }
  }
  
  class FileUploader {
    constructor(labelManager) {
      this.labelManager = labelManager;
      this.fileInput = DOMUtils.getElementById('csvFileInput');
      this.customBtn = DOMUtils.getElementById('custom-file-upload');
      this.progressMessage = DOMUtils.getElementById('progress-message');
    }
  
    async uploadFile() {
      const file = this.fileInput.files[0];
  
      if (!file) {
        AlertManager.showCustomAlert('Please upload a CSV file.');
        return;
      }
  
      try {
        await FileValidator.validateCSV(file);
      } catch (error) {
        AlertManager.showCustomAlert(error);
        return;
      }
  
      const labels = this.labelManager.getLabels();
      if (labels.length === 0) {
        AlertManager.showCustomAlert('Please add at least one Label.');
        return;
      }
  
      const formData = new FormData();
      formData.append('file', file);
      formData.append('labels', JSON.stringify(labels));
  
      this.showProgress('Processing your file, please wait...');
  
      try {
        const response = await fetch(API_ENDPOINTS.UPLOAD_CSV, {
          method: 'POST',
          body: formData
        });
  
        if (response.ok) {
          this.showProgress('Download will start shortly...');
          const blob = await response.blob();
          this.downloadFile(blob, 'categorized-output.csv');
        } else {
          throw new Error('Error generating output file.');
        }
      } catch (error) {
        AlertManager.showCustomAlert(error.message);
      } finally {
        this.hideProgress();
      }
    }
  
    showProgress(message) {
      this.progressMessage.style.display = 'block';
      this.progressMessage.textContent = message;
    }
  
    hideProgress() {
      this.progressMessage.style.display = 'none';
    }
  
    downloadFile(blob, fileName) {
      const url = window.URL.createObjectURL(blob);
      const a = DOMUtils.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  
    initializeFileInput() {
      this.fileInput.addEventListener('change', () => {
        if (this.fileInput.files && this.fileInput.files[0]) {
          const file = this.fileInput.files[0];
          this.customBtn.textContent = file.name;
          this.updatePriceEstimate(file);
        } else {
          this.customBtn.textContent = 'Choose File';
          this.resetPriceEstimate();
        }
      });
    }
  
    async updatePriceEstimate(file) {
      try {
        const numInputs = await FileValidator.validateCSV(file);
        const estimatedCost = PriceCalculator.calculatePrice(numInputs);
        const priceEstimateElement = DOMUtils.getElementById('price-estimate');
        PriceCalculator.animateValue(priceEstimateElement, 0, estimatedCost, 1000);
      } catch (error) {
        this.resetPriceEstimate();
        AlertManager.showCustomAlert(error);
      }
    }
  
    resetPriceEstimate() {
      const priceEstimateElement = DOMUtils.getElementById('price-estimate');
      priceEstimateElement.textContent = '$0.00';
    }
  }
  
  class App {
    constructor() {
      this.labelManager = new LabelManager();
      this.fileUploader = new FileUploader(this.labelManager);
    }
  
    init() {
      this.setupEventListeners();
      this.fileUploader.initializeFileInput();
      this.setupPreloader();
    }
  
    setupEventListeners() {
      document.addEventListener('mousemove', this.handleMouseMove);
    }
  
    handleMouseMove(e) {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      document.body.style.setProperty('--mouse-x', x + '%');
      document.body.style.setProperty('--mouse-y', y + '%');
    }
  
    setupPreloader() {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const preloader = DOMUtils.getElementById('preloader');
          preloader.style.opacity = '0';
          preloader.style.transition = 'opacity 1s ease';
  
          setTimeout(() => {
            preloader.style.display = 'none';
          }, 1000);
        }, 1000);
      });
    }
  }
  
  // Initialize the app
  const app = new App();
  document.addEventListener('DOMContentLoaded', () => app.init());
  
  // Expose necessary functions to global scope
  window.addLabel = () => app.labelManager.addLabel();
  window.uploadFile = () => app.fileUploader.uploadFile();
  window.removeLabel = (button) => app.labelManager.removeLabel(button);