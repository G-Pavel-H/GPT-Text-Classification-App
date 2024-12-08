export class CostCalculator {
    static MODEL_COSTS = {
        'gpt-4o': { tokenCost: 0.00250, outputCost: 0.01000 },
        'gpt-4o-mini': { tokenCost: 0.000150, outputCost: 0.000600 },
        'gpt-4-turbo': { tokenCost: 0.0100, outputCost: 0.0300 },
        'gpt-4': { tokenCost: 0.0300, outputCost: 0.0600 }
    };

    static calculateCost(model, totalTokens, numRows) {
        const costs = this.MODEL_COSTS[model] || { tokenCost: 0, outputCost: 0 };
        const totalOutCost = (numRows / 1000) * costs.outputCost;
        const totalCost = ((totalTokens / 1000) * costs.tokenCost) + totalOutCost;
        return totalCost.toFixed(10);
    }
}