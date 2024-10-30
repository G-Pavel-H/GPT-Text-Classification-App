import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { encoding_for_model } = require('tiktoken');

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
dotenv.config();

// Importing modules
import multer from 'multer';
import bodyParser from 'body-parser';
import cors from 'cors';
import OpenAI from 'openai';
import fs from 'fs';
import csv from 'fast-csv';
import helmet from 'helmet';
import fsExtra from 'fs-extra';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Express app
const app = express();


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
  const model = req.body.model || 'gpt-4o-mini'; 

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



app.post('/calculate-cost', upload.single('file'), async (req, res) => {
  const file = req.file;
  const model = req.body.model || 'gpt-4o-mini'; 

  let totalTokens = 0;
  let numRows = 0;
  const promises = [];

  try {
    // Initialize encoding once
    const encoding = await encoding_for_model('gpt-4');

    fs.createReadStream(file.path)
      .pipe(csv.parse({ headers: true }))
      .on('data', (row) => {
        if (row.Input) {
          numRows++;

          const inputText = row.Input;

          // Encode the input text and collect the promise
          const tokenCountPromise = (async () => {
            try {
              const tokens = encoding.encode(inputText);
              return tokens.length;
            } catch (error) {
              console.error('Error encoding input text:', error);
              return 0;
            }
          })();

          promises.push(tokenCountPromise);
        }
      })
      .on('end', async () => {
        try {
          const tokenCounts = await Promise.all(promises);
          totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);

          let costPer1000Tokens;
          let pricePerOutput;

          switch (model) {
            case 'gpt-4o':
              costPer1000Tokens = 0.00250; 
              pricePerOutput = 0.01000;
              break; 
            case 'gpt-4o-mini':
              costPer1000Tokens = 0.000150;
              pricePerOutput = 0.000600; 
              break;
            case 'gpt-4-turbo':
              costPer1000Tokens = 0.0100; 
              pricePerOutput = 0.0300;
              break;
            case 'gpt-4':
              costPer1000Tokens = 0.0300; 
              pricePerOutput = 0.0600;
              break;
            // case 'o1-preview':
            //   costPer1000Tokens = 0.015;
            //   pricePerOutput = 0.060;
            //   break;
            // case 'o1-mini':
            //   costPer1000Tokens = 0.003; 
            //   pricePerOutput = 0.012;
            //   break;
            default:
              costPer1000Tokens = 0;  
              pricePerOutput = 0;             
          }

          const totalOutCost = (numRows / 1000) * pricePerOutput;
          const totalCost = ((totalTokens / 1000) * costPer1000Tokens) + totalOutCost;

          fsExtra.remove(file.path);
          encoding.free();
          
          res.json({ totalTokens, totalCost: totalCost.toFixed(10)});
        } catch (error) {
          console.error('Error processing token counts:', error);
          fsExtra.remove(file.path);
          res.status(500).send('Error processing the file');
        }
      })
      .on('error', (error) => {
        console.error('Error reading CSV file:', error);
        fsExtra.remove(file.path);
        res.status(500).send('Error reading the file');
      });
  } catch (error) {
    console.error('Error initializing encoding:', error);
    fsExtra.remove(file.path);
    res.status(500).send('Error initializing the tokenizer');
  }
});



// Start the server
const PORT = 5555;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});