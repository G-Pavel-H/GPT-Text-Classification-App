require('dotenv').config();

// Add this import at the top
const { encode } = require('gpt-3-encoder'); // Install via: npm install gpt-3-encoder

const multer = require('multer');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs');
const csv = require('fast-csv');
const helmet = require('helmet');
const fsExtra = require('fs-extra');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Express app
const app = express();
const path = require('path');

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(cors());
app.use(helmet());

// Setup file upload
const upload = multer({ dest: 'uploads/' });

// Helper function to call ChatGPT API
async function getLabel(text, labels, model) {
  const messages = [
    {
      role: 'system',
      content:
        'You are an assistant that categorizes text based on provided labels and definitions.',
    },
    {
      role: 'user',
      content: `Categorize the following text into one of the provided labels based on their definitions:\n\nText: "${text}"\n\nLabels and Definitions:\n${labels
        .map(
          (label, index) =>
            `${index + 1}. ${label.name}: ${label.definition}`
        )
        .join('\n')}\n\nPlease respond with the most appropriate label only.`,
    },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: model, // Use the selected model
      messages: messages,
      temperature: 0.2,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error(
      'Error with OpenAI API:',
      error.response ? error.response.data : error.message
    );
    return 'Error';
  }
}
// Endpoint to handle CSV file upload
app.post('/upload-csv', upload.single('file'), async (req, res) => {
  const file = req.file;
  const labels = req.body.labels ? JSON.parse(req.body.labels) : [];
  const model = req.body.model || 'gpt-3.5-turbo'; // Default to GPT-3.5 Turbo if not specified

  const writeStream = fs.createWriteStream(`output-${file.filename}.csv`);
  const csvStream = csv.format({ headers: ['Input', 'Output'] });
  csvStream.pipe(writeStream);

  const promises = [];

  fs.createReadStream(file.path)
    .pipe(csv.parse({ headers: true }))
    .on('error', (error) => {
      console.error('Error reading CSV file:', error);
      res.status(500).send('Error reading the file');
    })
    .on('data', (row) => {
      if (row.Input) {
        const promise = getLabel(row.Input, labels, model).then((label) => {
          csvStream.write({ Input: row.Input, Output: label });
        });
        promises.push(promise);
      }
    })
    .on('end', () => {
      Promise.all(promises)
        .then(() => {
          csvStream.end();
          res.download(
            `output-${file.filename}.csv`,
            `output-${file.filename}.csv`,
            (err) => {
              if (err) {
                console.error('Error during download:', err);
                res.status(500).send('Error generating the file');
              } else {
                // Delete the uploaded file and the output file
                fsExtra.remove(file.path);
                fsExtra.remove(`output-${file.filename}.csv`);
              }
            }
          );
        })
        .catch((error) => {
          console.error('Error processing CSV:', error);
          res.status(500).send('Error processing the file');
        });
    });
});


// Add the new endpoint for cost calculation
app.post('/calculate-cost', upload.single('file'), async (req, res) => {
  const file = req.file;
  const labels = req.body.labels ? JSON.parse(req.body.labels) : [];
  const model = req.body.model || 'gpt-3.5-turbo'; // Default to GPT-3.5 Turbo if not specified

  let totalTokens = 0;

  fs.createReadStream(file.path)
    .pipe(csv.parse({ headers: true }))
    .on('data', (row) => {
      if (row.Input) {
        const prompt = `Categorize the following text into one of the provided labels based on their definitions:\n\nText: "${row.Input}"\n\nLabels and Definitions:\n${labels
          .map((label, index) => `${index + 1}. ${label.name}: ${label.definition}`)
          .join('\n')}\n\nPlease respond with the most appropriate label only.`;

        const tokens = encode(prompt).length;
        totalTokens += tokens;
      }
    })
    .on('end', () => {
      // Set cost per 1000 tokens based on the model
      let costPer1000Tokens;
      if (model === 'gpt-3.5-turbo') {
        costPer1000Tokens = 0.0015; // Example price
      } else if (model === 'gpt-4') {
        costPer1000Tokens = 0.03; // Example price
      } else {
        costPer1000Tokens = 0.0015; // Default price
      }

      // Estimate the cost
      const totalCost = (totalTokens / 1000) * costPer1000Tokens;

      // Delete the uploaded file
      fsExtra.remove(file.path);

      res.json({ totalTokens, totalCost });
    })
    .on('error', (error) => {
      console.error('Error reading CSV file:', error);
      fsExtra.remove(file.path);
      res.status(500).send('Error reading the file');
    });
});

// Start the server
const PORT = 5555;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});