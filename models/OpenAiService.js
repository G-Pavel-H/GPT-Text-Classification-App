import OpenAI from 'openai';
export class OpenAIService {
    constructor(apiKey) {
        this.client = new OpenAI({ apiKey });
    }

    async getLabel(text, labels, model) {
        const messages = [
            {
                role: 'system',
                content: 'You are an assistant that categorizes text based on provided labels and definitions.'
            },
            {
                role: 'user',
                content: `Categorize the following text into one of the provided labels based on their definitions:\n\nText: "${text}"\n\nLabels and Definitions:\n${labels
                    .map((label, index) => `${index + 1}. ${label.name}: ${label.definition}`)
                    .join('\n')}\n\nPlease respond with the most appropriate label only.`
            }
        ];

        try {
            const response = await this.client.chat.completions.create({
                model,
                messages,
                temperature: 0.2
            });
            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('Error with OpenAI API:', error.response ? error.response.data : error.message);
            return 'Error';
        }
    }
}
