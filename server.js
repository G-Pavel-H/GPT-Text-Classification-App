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
// Batch size configuration
const BATCH_SIZE = 20; // Adjust based on your needs and API limits

async function processBatch(texts, labels, model) {
  const messages = texts.map(text => ({
    messages: [
      {
        role: 'system',
        content: 'You are an assistant that categorizes text based on provided labels and definitions.',
      },
      {
        role: 'user',
        content: `Categorize the following text into one of the provided labels based on their definitions:\n\nText: "${text}"\n\nLabels and Definitions:\n${labels
          .map(
            (label, index) =>
              `${index + 1}. ${label.name}: ${label.definition}`
          )
          .join('\n')}\n\nPlease respond with the most appropriate label only.`,
      }
    ]
  }));

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: messages[0].messages, // First message as the template
      temperature: 0.2,
      n: texts.length // Number of completions to generate
    });

    return response.choices.map(choice => choice.message.content.trim());
  } catch (error) {
    console.error(
      'Error with OpenAI API:',
      error.response ? error.response.data : error.message
    );
    return Array(texts.length).fill('Error');
  }
}

async function processCSVInBatches(inputRows, labels, model) {
  const results = [];
  
  for (let i = 0; i < inputRows.length; i += BATCH_SIZE) {
    const batch = inputRows.slice(i, i + BATCH_SIZE);
    const texts = batch.map(row => row.Input);
    
    // Add delay between batches to respect rate limits
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    }
    
    const batchResults = await processBatch(texts, labels, model);
    
    // Combine original inputs with results
    batch.forEach((row, index) => {
      results.push({
        Input: row.Input,
        Output: batchResults[index]
      });
    });
  }
  
  return results;
}

// Modified endpoint to handle CSV file upload
app.post('/upload-csv', upload.single('file'), async (req, res) => {
  const file = req.file;
  const labels = req.body.labels ? JSON.parse(req.body.labels) : [];
  const model = req.body.model || 'gpt-4-turbo-preview';
  
  try {
    // Read all rows from CSV first
    const inputRows = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(file.path)
        .pipe(csv.parse({ headers: true }))
        .on('error', reject)
        .on('data', row => {
          if (row.Input) {
            inputRows.push(row);
          }
        })
        .on('end', resolve);
    });

    // Process all rows in batches
    const results = await processCSVInBatches(inputRows, labels, model);

    // Write results to output CSV
    const outputPath = `output-${file.filename}.csv`;
    const writeStream = fs.createWriteStream(outputPath);
    const csvStream = csv.format({ headers: true });
    csvStream.pipe(writeStream);
    
    results.forEach(result => csvStream.write(result));
    csvStream.end();

    // Wait for the file to be written
    await new Promise(resolve => writeStream.on('finish', resolve));

    // Send the file back to the client
    res.download(outputPath, outputPath, (err) => {
      if (err) {
        console.error('Error during download:', err);
        res.status(500).send('Error generating the file');
      } else {
        // Clean up files
        fsExtra.remove(file.path);
        fsExtra.remove(outputPath);
      }
    });
  } catch (error) {
    console.error('Error processing CSV:', error);
    res.status(500).send('Error processing the file');
  }
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