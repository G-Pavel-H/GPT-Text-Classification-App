import { CONFIG } from "./constants.js";

export class LabelManager {
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
            <input type="text" placeholder="Label Name (Max: ${CONFIG.LABEL_NAME_MAX_CHAR_COUNT})" class="label-name" maxlength="${CONFIG.LABEL_NAME_MAX_CHAR_COUNT}">
            <input type="text" placeholder="Label Definition (Max: ${CONFIG.LABEL_DEF_MAX_CHAR_COUNT})" class="label-definition" maxlength="${CONFIG.LABEL_DEF_MAX_CHAR_COUNT}">
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
            label.name.length > CONFIG.LABEL_NAME_MAX_CHAR_COUNT || 
            label.definition.length > CONFIG.LABEL_DEF_MAX_CHAR_COUNT)) {
            throw new Error(`Label has exceeded the limit of characters - ${CONFIG.LABEL_NAME_MAX_CHAR_COUNT}.`);
        }

        return labels;
    }
}