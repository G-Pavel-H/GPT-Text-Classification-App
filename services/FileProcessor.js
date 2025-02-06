import fs from 'fs';
import csv from 'fast-csv';
import fsExtra from 'fs-extra';
import {encoding_for_model} from "tiktoken";
import pLimit from 'p-limit';
import {CONFIG} from "../config.js";
import {UserSpendingTracker} from "../models/UserSpendingTracker.js";
export const activeFiles = new Set();

export class FileProcessor {
    static calculateBatchSize(totalRows) {
        if (totalRows < 100) return 5;
        if (totalRows < 1000) return 10;
        if (totalRows < 10000) return 50;
        return 100;
    }

    static async processCSVForLabeling(file, labels, model, openAIService, rateLimiter, userId, ipAddress, numRows) {

        activeFiles.add(file.path);
        const outputPath = `output-${file.filename}.csv`;
        activeFiles.add(outputPath);

        try {
            await UserSpendingTracker.initializeProcessing(userId, ipAddress, numRows, 'processing');
            await rateLimiter.incrementProcessingRequests();


            const writeStream = fs.createWriteStream(outputPath);
            const csvStream = csv.format({ headers: ['Input', 'Output'] });
            csvStream.pipe(writeStream);

            const encoding = await encoding_for_model(model);
            const rows = [];

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

            // Create array to store results in order
            const results = new Array(rows.length).fill(null);
            let processedCount = 0;
            const batchSize = this.calculateBatchSize(numRows);

            console.time("Labeling");
            // Implement controlled concurrency
            const concurrencyLevel = CONFIG.concurrency_level_api;
            const limit = pLimit(concurrencyLevel);
            const promises = rows.map((row, index) =>
                limit(async () => {
                    try {
                        const tokens = encoding.encode(row.Input).length;
                        await rateLimiter.waitForRateLimit(tokens);
                        const label = await openAIService.getLabel(row.Input, labels, model);
                        results[index] = { Input: row.Input, Output: label };

                        processedCount++;
                        if (processedCount % batchSize === 0 || processedCount === rows.length) {
                            await UserSpendingTracker.updateProcessingProgress(userId, ipAddress, processedCount, numRows, 'processing');
                        }

                    } catch (error) {
                        console.error(`Error processing row: ${row.Input}`, error);
                        throw error;
                    }
                })
            );

            // Wait for all promises to complete
            await Promise.all(promises);
            console.timeEnd("Labeling");

            await UserSpendingTracker.updateProcessingProgress(
                userId,
                ipAddress,
                0,  // Reset progress for write phase
                results.length,
                'writing'
            );

            console.time("writeCSV");
            let writtenCount = 0;

            await new Promise((resolve, reject) => {
                const writeNextBatch = () => {
                    const batchEnd = Math.min(writtenCount + batchSize, results.length);
                    while (writtenCount < batchEnd) {
                        if (results[writtenCount]) {
                            csvStream.write({
                                Input: results[writtenCount].Input,
                                Output: results[writtenCount].Output
                            });
                        }
                        writtenCount++;
                    }

                    // Update progress synchronously to prevent race conditions
                    UserSpendingTracker.updateProcessingProgress(
                        userId,
                        ipAddress,
                        writtenCount,
                        results.length,
                        'writing'
                    );

                    if (writtenCount < results.length) {
                        // Schedule next batch with setTimeout to prevent blocking
                        setTimeout(writeNextBatch, 0);
                    } else {
                        csvStream.end();
                    }
                };

                writeNextBatch();
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            encoding.free();

            await UserSpendingTracker.finalizeProcessing(userId);
            console.timeEnd("writeCSV");
            await Promise.all(promises);
            return outputPath;

        } finally {
            activeFiles.delete(file.path);
            activeFiles.delete(outputPath);
        }
    }

    static async calculateTokens(file, model) {
        const encoding = await encoding_for_model(model);
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
        if (rateLimiter) {
            await rateLimiter.decrementProcessingRequests();
        }
        if (Array.isArray(filePaths)) {
            await Promise.all(filePaths.map(path => {
                if (path) { // Ensure path is defined
                    return fsExtra.remove(path).catch(() => {}); // Ignore errors if file doesn't exist
                }
            }));
        } else if (filePaths) { // Ensure filePaths is defined
            await fsExtra.remove(filePaths).catch(() => {}); // Ignore errors if file doesn't exist
        }
    }
}