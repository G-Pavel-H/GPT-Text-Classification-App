import fs from 'fs';
import csv from 'fast-csv';
import fsExtra from 'fs-extra';
import {encoding_for_model} from "tiktoken";
import pLimit from 'p-limit';
import {CONFIG} from "../config.js";
export const activeFiles = new Set();

export class FileProcessor {
    static async processCSVForLabeling(file, labels, model, openAIService, rateLimiter) {
        // Add the file to the active list
        activeFiles.add(file.path);

        const outputPath = `output-${file.filename}.csv`;
        activeFiles.add(outputPath);

        try {
            await rateLimiter.incrementProcessingRequests();
            const writeStream = fs.createWriteStream(outputPath);
            const csvStream = csv.format({ headers: ['Input', 'Output'] });
            csvStream.pipe(writeStream);

            const encoding = await encoding_for_model(model);
            const rows = [];

            // Read all rows into an array
            await new Promise((resolve, reject) => {
                fs.createReadStream(file.path)
                    .pipe(csv.parse({ headers: true }))
                    .on('error', (error) => {
                        console.error('Error reading CSV file:', error);
                        reject(error);
                    })
                    .on('data', (row) => {
                        if (row.Input) {
                            rows.push(row);
                        }
                    })
                    .on('end', resolve);
            });

            // Implement controlled concurrency
            const concurrencyLevel = CONFIG.concurrency_level_api;
            const limit = pLimit(concurrencyLevel);
            const promises = rows.map((row) =>
                limit(async () => {
                    try {
                        const tokens = encoding.encode(row.Input).length;

                        // Wait for rate limiter
                        await rateLimiter.waitForRateLimit(tokens);

                        // Make the API call
                        const label = await openAIService.getLabel(row.Input, labels, model);

                        // Write to CSV
                        csvStream.write({ Input: row.Input, Output: label });
                    } catch (error) {
                        console.error(`Error processing row: ${row.Input}`, error);
                        throw error;
                    }
                })
            );

            // Wait for all promises to complete
            await Promise.all(promises);

            csvStream.end();
            encoding.free();

            return outputPath;
        } finally {
            activeFiles.delete(file.path);
            activeFiles.delete(outputPath);
        }
    }

    static async calculateTokens(file) {
        const encoding = await encoding_for_model('gpt-4');
        let totalTokens = 0;
        let numRows = 0;

        return new Promise((resolve, reject) => {
            const promises = [];

            fs.createReadStream(file.path)
                .pipe(csv.parse({ headers: true }))
                .on('data', (row) => {
                    if (row.Input) {
                        numRows++;
                        promises.push((async () => {
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
                        const tokenCounts = await Promise.all(promises);
                        totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);
                        encoding.free();
                        resolve({ totalTokens, numRows });
                    } catch (error) {
                        reject(error);
                    }
                })
                .on('error', reject);
        });
    }

    static async cleanup(filePaths, rateLimiter) {
        if(rateLimiter) {
            await rateLimiter.decrementProcessingRequests();
        }
        if (Array.isArray(filePaths)) {
            await Promise.all(filePaths.map(path => fsExtra.remove(path)));
        } else {
            await fsExtra.remove(filePaths);
        }
    }
}