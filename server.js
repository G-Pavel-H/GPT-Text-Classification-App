import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import { CONFIG } from './config.js';
import { OpenAIService } from './models/OpenAiService.js';
import { CostCalculator } from './models/CostCalculator.js';
import { FileProcessor } from './services/FileProcessor.js';
import {encoding_for_model} from "tiktoken";
import fs from "fs";
import csv from "fast-csv";
import { RateLimiter } from "./models/RateLimiter.js";
import {connectToDatabase, getMongoCollection} from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Server {
  constructor() {
    this.app = express();
    this.openAIService = new OpenAIService(CONFIG.OPENAI_API_KEY);
    this.upload = multer({ dest: CONFIG.UPLOAD_DIR });
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use(bodyParser.json());
    this.app.use(cors());
    this.app.use(helmet());
  }

  setupRoutes() {
    let outputPath;
    this.app.post('/upload-csv', this.upload.single('file'), async (req, res) => {
      try {
        const labels = req.body.labels ? JSON.parse(req.body.labels) : [];
        const model = req.body.model || CONFIG.DEFAULT_MODEL;

        // Calculate total tokens and rows before processing
        const encoding = await encoding_for_model(model);
        let totalTokens = 0;
        let numRows = 0;

        // First pass to calculate total tokens
        const tokenPromises = [];
        await new Promise((resolve, reject) => {
          fs.createReadStream(req.file.path)
              .pipe(csv.parse({ headers: true }))
              .on('data', (row) => {
                if (row.Input) {
                  numRows++;
                  tokenPromises.push((async () => {
                    try {
                      const tokens = encoding.encode(row.Input);
                      return tokens.length;
                    } catch (error) {
                      console.error('Error encoding input text:', error);
                      return 0;
                    }
                  })());
                }
              })
              .on('end', async () => {
                try {
                  const tokenCounts = await Promise.all(tokenPromises);
                  totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);
                  encoding.free();
                  resolve();
                } catch (error) {
                  reject(error);
                }
              })
              .on('error', reject);
        });

        // Initialize rate limiter
        const rateLimiter = new RateLimiter(model);

        // Process CSV and generate output
        const outputPath = await FileProcessor.processCSVForLabeling(
            req.file,
            labels,
            model,
            this.openAIService,
            rateLimiter // Pass the rateLimiter instance
        );

        res.download(outputPath, async (err) => {
          if (err) {
            console.error('Error during download:', err);
            res.status(500).send('Error generating the file');
          }
          await FileProcessor.cleanup([req.file.path, outputPath]);
        });
      }
      catch (error) {
        console.error('Error processing CSV:', error);
        // Handle specific errors
        if (error.message.includes('Daily limit exceeded'))
        {
          res.status(429).json({ error: 'Daily API limit would be exceeded' });
        }
        else if (error.response && error.response.status === 429)
        {
          // Handle OpenAI API rate limit errors
          res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
        }
        else
        {
          res.status(500).json({ error: 'An error occurred during processing', details: error.message });
        }
        await FileProcessor.cleanup([req.file.path, outputPath]);
      }
    });

    this.app.post('/calculate-cost', this.upload.single('file'), async (req, res) => {
      try {
        const model = req.body.model || CONFIG.DEFAULT_MODEL;
        const { totalTokens, numRows } = await FileProcessor.calculateTokens(req.file);
        const totalCost = CostCalculator.calculateCost(model, totalTokens, numRows);

        await FileProcessor.cleanup(req.file.path);
        res.json({ totalTokens, totalCost });
      }
      catch (error) {
        console.error('Error calculating cost:', error);
        res.status(500).send('Error processing the file');
        await FileProcessor.cleanup(req.file.path);
      }
    });
  }

  start() {
    this.app.listen(CONFIG.PORT, () => {
      console.log(`Server running on http://localhost:${CONFIG.PORT}`);
    });
  }
}
await connectToDatabase(CONFIG.MONGO_DB_URI);
const collection = getMongoCollection('models_limits');
await collection.createIndex({ model: 1 }, { unique: true });

const server = new Server();
server.start();