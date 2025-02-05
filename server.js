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
import { FileProcessor, activeFiles } from './services/FileProcessor.js';
import {encoding_for_model} from "tiktoken";
import fs from "fs";
import csv from "fast-csv";
import { RateLimiter } from "./models/RateLimiter.js";
import {closeConnection, connectToDatabase, getMongoCollection} from "./db.js";
import {UserSpendingTracker} from "./models/UserSpendingTracker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Server {
  constructor() {
    this.app = express();
    this.openAIService = new OpenAIService(CONFIG.OPENAI_API_KEY);
    this.upload = multer({ dest: CONFIG.UPLOAD_DIR });
    this.setupMiddleware();
    this.setupRoutes();
    this.app.set('trust proxy', true);
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
      const rateLimiter = new RateLimiter(req.body.model || CONFIG.DEFAULT_MODEL);
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

        // Process CSV and generate output
        const outputPath = await FileProcessor.processCSVForLabeling(
            req.file,
            labels,
            model,
            this.openAIService,
            rateLimiter,
            req.ip,
            numRows
        );

        res.download(outputPath, async (err) => {
          if (err) {
            console.error('Error during download:', err);
            res.status(500).send('Error generating the file');
          }
          await FileProcessor.cleanup([req.file.path, outputPath], rateLimiter);
        });

        req.userSpending = { ipAddress: req.ip, estimatedCost: parseFloat(req.body.totalCost)};
        await UserSpendingTracker.recordUserSpending(req.userSpending.ipAddress, req.userSpending.estimatedCost);
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
        await FileProcessor.cleanup([req.file.path, outputPath], rateLimiter);
      }
    });

    this.app.post('/calculate-cost', this.upload.single('file'), async (req, res) => {
      try {
        const model = req.body.model || CONFIG.DEFAULT_MODEL;
        const { totalTokens, numRows } = await FileProcessor.calculateTokens(req.file, model);
        const totalCost = CostCalculator.calculateCost(model, totalTokens, numRows);

        // Now run the spending limit check with the actually computed cost.
        // We'll simulate calling checkSpendingLimit inline or using the middleware manually:
        const ipAddress = req.ip; // or from X-Forwarded-For if behind proxy
        const dailySpending = await UserSpendingTracker.getUserDailySpending(ipAddress);
        const newTotalSpending = parseFloat(dailySpending) + parseFloat(totalCost);

        if (newTotalSpending > UserSpendingTracker.DAILY_SPENDING_LIMIT) {
          // User exceeded spending limit
          await FileProcessor.cleanup(req.file.path);
          return res.status(403).json({
            error: 'Daily spending limit exceeded',
            currentSpending: dailySpending,
            limit: UserSpendingTracker.DAILY_SPENDING_LIMIT
          });
        }

        // If we’re here, user is within the daily limit
        await FileProcessor.cleanup(req.file.path);

        // Return normal response
        res.json({ totalTokens, totalCost, numRows });
      } catch (error) {
        console.error('Error calculating cost:', error);
        await FileProcessor.cleanup(req.file.path);
        res.status(500).send('Error processing the file');
      }
    });

    this.app.get('/processing-requests', async (req, res) => {
      try {
        const model = req.query.model || CONFIG.DEFAULT_MODEL;
        const rateLimiter = new RateLimiter(model);
        const processingRequests = await rateLimiter.getProcessingRequestsCount();

        // Estimate processing time (assume each request takes ~5 seconds)
        const estimatedTimePerRequest = 5; // seconds
        const estimatedTotalTime = processingRequests * estimatedTimePerRequest;

        res.json({
          processingRequests,
          estimatedTimeRemaining: estimatedTotalTime
        });
      } catch (error) {
        console.error('Error fetching processing requests:', error);
        res.status(500).json({ error: 'Could not fetch processing requests' });
      }
    });

    this.app.get('/processing-progress', async (req, res) => {
      try {
        const ipAddress = req.ip;
        const progress = await UserSpendingTracker.getProcessingProgress(ipAddress);
        const phase = progress.currentPhase || 'processing';

        let percentComplete;

        if (!progress.processingActive) {
          percentComplete = 0;
        } else if (progress.totalRows === 0) {
          percentComplete = 0;
        } else {
          if (phase === 'processing') {
            percentComplete = (progress.processedRows / progress.totalRows) * 90;
          } else if (phase === 'writing') {
            const writeProgress = (progress.processedRows / progress.totalRows) * 10;
            percentComplete = 90 + writeProgress;
          }
        }

        percentComplete = Math.min(Math.max(Math.round(percentComplete), 0), 100);

        // Calculate processing rate and estimated time remaining
        let estimatedTimeRemaining = null;
        if (progress.lastUpdateTime && progress.processedRows > 0 && progress.processingActive) {
          const elapsedTime = new Date() - new Date(progress.lastUpdateTime);
          const rowsRemaining = progress.totalRows - progress.processedRows;
          const processingRate = progress.processedRows / elapsedTime;
          estimatedTimeRemaining = Math.ceil(rowsRemaining / processingRate / 1000); // in seconds
        }

        res.json({
          processedRows: progress.processedRows,
          totalRows: progress.totalRows,
          percentComplete: percentComplete,
          estimatedTimeRemaining,
          processingActive: progress.processingActive,
          currentPhase: phase
        });

      } catch (error) {
        console.error('Error fetching processing progress:', error);
        res.status(500).json({ error: 'Could not fetch processing progress' });
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

// Signal handling for graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT. Cleaning up...');
  await shutdownCleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM. Cleaning up...');
  await shutdownCleanup();
  process.exit(0);
});

async function shutdownCleanup() {
  try {
    console.log('Performing cleanup tasks...');
    await RateLimiter.resetAllProcessingRequests();

    await closeConnection();

    // Cleanup logic for uploaded files (if any files are still being tracked)
    if (activeFiles && activeFiles.size > 0) {
      console.log(`Cleaning up ${activeFiles.size} active files...`);
      await Promise.all([...activeFiles].map((filePath) => fs.promises.unlink(filePath).catch(() => {})));
      console.log('Cleanup complete.');
    }
    else {
      console.log('No active files to clean up.');
    }
    console.log('Cleanup tasks completed. Shutting down...');
  }
  catch (error) {
    console.error('Error during shutdown cleanup:', error);
  }
}

server.start();