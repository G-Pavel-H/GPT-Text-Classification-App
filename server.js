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
    this.app.post('/upload-csv', this.upload.single('file'), async (req, res) => {
      try {
        const labels = req.body.labels ? JSON.parse(req.body.labels) : [];
        const model = req.body.model || CONFIG.DEFAULT_MODEL;
        const outputPath = await FileProcessor.processCSVForLabeling(
            req.file,
            labels,
            model,
            this.openAIService
        );

        res.download(outputPath, async (err) => {
          if (err) {
            console.error('Error during download:', err);
            res.status(500).send('Error generating the file');
          }
          await FileProcessor.cleanup([req.file.path, outputPath]);
        });
      } catch (error) {
        console.error('Error processing CSV:', error);
        await FileProcessor.cleanup(req.file.path);
        res.status(500).send('Error processing the file');
      }
    });

    this.app.post('/calculate-cost', this.upload.single('file'), async (req, res) => {
      try {
        const model = req.body.model || CONFIG.DEFAULT_MODEL;
        const { totalTokens, numRows } = await FileProcessor.calculateTokens(req.file);
        const totalCost = CostCalculator.calculateCost(model, totalTokens, numRows);

        await FileProcessor.cleanup(req.file.path);
        res.json({ totalTokens, totalCost });
      } catch (error) {
        console.error('Error calculating cost:', error);
        await FileProcessor.cleanup(req.file.path);
        res.status(500).send('Error processing the file');
      }
    });
  }

  start() {
    this.app.listen(CONFIG.PORT, () => {
      console.log(`Server running on http://localhost:${CONFIG.PORT}`);
    });
  }
}

const server = new Server();
server.start();