import { CONFIG } from "./constants.js";

export class PriceCalculator {
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
            throw new Error('An error occurred while calculating token count:' + error);
        }
    }

    reset() {
        this.isValid = false;
    }
}