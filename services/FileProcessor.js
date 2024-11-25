import fs from 'fs';
import csv from 'fast-csv';
import fsExtra from 'fs-extra';
import {encoding_for_model} from "tiktoken";

export class FileProcessor {
    static async processCSVForLabeling(file, labels, model, openAIService) {
        const outputPath = `output-${file.filename}.csv`;
        const writeStream = fs.createWriteStream(outputPath);
        const csvStream = csv.format({ headers: ['Input', 'Output'] });
        csvStream.pipe(writeStream);

        const promises = [];

        return new Promise((resolve, reject) => {
            fs.createReadStream(file.path)
                .pipe(csv.parse({ headers: true }))
                .on('error', (error) => {
                    console.error('Error reading CSV file:', error);
                    reject(error);
                })
                .on('data', (row) => {
                    if (row.Input) {
                        const promise = openAIService.getLabel(row.Input, labels, model)
                            .then(label => csvStream.write({ Input: row.Input, Output: label }));
                        promises.push(promise);
                    }
                })
                .on('end', () => {
                    Promise.all(promises)
                        .then(() => {
                            csvStream.end();
                            resolve(outputPath);
                        })
                        .catch(reject);
                });
        });
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

    static async cleanup(filePaths) {
        if (Array.isArray(filePaths)) {
            await Promise.all(filePaths.map(path => fsExtra.remove(path)));
        } else {
            await fsExtra.remove(filePaths);
        }
    }
}