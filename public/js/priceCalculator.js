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
                const errorData = await response.json().catch(() => ({}));
                if (errorData.error && errorData.error.includes('Daily spending limit exceeded')) {
                    throw new Error('Daily spending limit exceeded. You cannot process this file.');
                } else {
                    throw new Error('Error calculating token count.');
                }
                throw new Error('Error calculating token count.');
            }

            const data = await response.json();

            // TODO: Remember to change this gpt-4-turbo limit if the limits change
            // TODO: make the max allowed rows be dependant on the model input, i.e. create an object containing those
            if(model === "gpt-4-turbo"){
                this.isValid = data.totalCost <= CONFIG.MAX_ALLOWED_PRICE && data.numRows <= 250;
            }
            else{
                this.isValid = data.totalCost <= CONFIG.MAX_ALLOWED_PRICE && data.numRows <= CONFIG.MAX_ALLOWED_ROWS;
            }


            return {
                totalCost: data.totalCost,
                isValid: this.isValid,
                error: this.isValid ? null : `File is too large, exceeded price limit of $${CONFIG.MAX_ALLOWED_PRICE} or row limit of ${CONFIG.MAX_ALLOWED_ROWS} (250 for gpt-4-turbo).`,
                totalTokens: data.totalTokens,
                totalRequests: data.numRows
            };
        } catch (error) {
            throw new Error('An error occurred while calculating token count:' + error);
        }
    }

    reset() {
        this.isValid = false;
    }
}