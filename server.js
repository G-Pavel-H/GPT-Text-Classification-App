// Import required libraries
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Configuration, OpenAIApi } = require('openai');

// Initialize Express app
const app = express();
app.use(bodyParser.json());
app.use(cors());

// Set up OpenAI configuration
const configuration = new Configuration({
    apiKey: 'your-openai-api-key-here' // Replace this with your actual API key
});
const openai = new OpenAIApi(configuration);

// Endpoint to handle categorization requests
app.post('/categorize', async (req, res) => {
    const { text, labels } = req.body;

    // Create a prompt for ChatGPT
    const prompt = `Categorize the following text into one of the provided labels based on their definitions:\n\nText: "${text}"\n\nLabels and Definitions:\n`;

    labels.forEach((label, index) => {
        prompt += `${index + 1}. ${label.name}: ${label.definition}\n`;
    });

    prompt += `\nPlease respond with the most appropriate label only.`;

    try {
        // Make the API request to OpenAI
        const response = await openai.createCompletion({
            model: 'text-davinci-003', // You can choose other models if needed
            prompt: prompt,
            max_tokens: 50,
            temperature: 0.2
        });

        // Extract and send back the label
        const chosenLabel = response.data.choices[0].text.trim();
        res.json({ label: chosenLabel });
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        res.status(500).json({ error: 'Something went wrong with the categorization request' });
    }
});

// Start the server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});