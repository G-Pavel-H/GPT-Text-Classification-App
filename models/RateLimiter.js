import { CONFIG } from '../config.js';
import { getMongoCollection } from '../db.js'; // Function to get the MongoDB collection

export class RateLimiter {
    static RATE_LIMITS = {
        'gpt-4o': {
            tokensPerMinute: 30000,
            requestsPerMinute: 500,
            tokensPerDay: 90000,
            requestsPerDay: Infinity // Not specified in the original table
        },
        'gpt-4o-mini': {
            tokensPerMinute: 200000,
            requestsPerMinute: 500,
            tokensPerDay: 2000000,
            requestsPerDay: 10000
        },
        'gpt-4': {
            tokensPerMinute: 10000,
            requestsPerMinute: 500,
            tokensPerDay: 100000,
            requestsPerDay: 10000
        },
        'gpt-4-turbo': {
            tokensPerMinute: 30000,
            requestsPerMinute: 500,
            tokensPerDay: 90000,
            requestsPerDay: Infinity
        }
    };

    constructor(model = CONFIG.DEFAULT_MODEL) {
        this.model = model;
        this.limits = RateLimiter.RATE_LIMITS[this.model];
        this.requestTimestamps = [];
        this.tokenTimestamps = [];
    }

    async waitForRateLimit(tokensNeeded) {
        const dailyLimitExceeded = await this.isDailyLimitExceeded(tokensNeeded, 1);

        if (dailyLimitExceeded) {
            throw new Error(`Daily limit exceeded for model ${this.model}`);
        }

        let now = Date.now();
        this.cleanUpOldTimestamps(now);

        while (
            this.requestTimestamps.length >= this.limits.requestsPerMinute ||
            this.totalTokensInWindow() + tokensNeeded > this.limits.tokensPerMinute
            ) {
            const timeUntilNextRequest = this.timeUntilNextRequestAllowed(now);
            console.warn(`Rate limit reached. Waiting ${timeUntilNextRequest}ms...`);
            await new Promise((resolve) => setTimeout(resolve, timeUntilNextRequest));

            now = Date.now();
            this.cleanUpOldTimestamps(now);
        }

        // Record the new request and tokens
        this.requestTimestamps.push(now);
        this.tokenTimestamps.push({ timestamp: now, tokens: tokensNeeded });

        // Update daily usage for this specific model
        await this.updateDailyUsage(tokensNeeded);
    }


    async isDailyLimitExceeded(tokensNeeded, requestsNeeded) {
        const today = getTodayDateString();
        const collection = getMongoCollection('models_limits');

        // Fetch the model usage document
        let modelUsage = await collection.findOne({ model: this.model });

        // If no document exists for the model, initialize one
        if (!modelUsage) {
            try {
                await collection.insertOne({
                    model: this.model,
                    requestCount: 0,
                    tokenCount: 0,
                    lastResetDate: today,
                    processingRequests: 0,
                });
                modelUsage = { requestCount: 0, tokenCount: 0, lastResetDate: today };
            } catch (error) {
                if (error.code === 11000) {
                    // Duplicate key error, document was inserted by another process
                    modelUsage = await collection.findOne({ model: this.model });
                } else {
                    throw error;
                }
            }
        }

        // Check if the counts need to be reset
        if (modelUsage.lastResetDate !== today) {
            // Reset counts and update lastResetDate
            await collection.updateOne(
                { model: this.model },
                {
                    $set: {
                        requestCount: 0,
                        tokenCount: 0,
                        lastResetDate: today,
                    },
                }
            );
            modelUsage.requestCount = 0;
            modelUsage.tokenCount = 0;
            modelUsage.lastResetDate = today;
        }

        const limits = this.limits;

        // Check daily requests limit
        if (
            limits.requestsPerDay !== Infinity &&
            modelUsage.requestCount + requestsNeeded > limits.requestsPerDay
        ) {
            return true;
        }

        // Check daily tokens limit
        return limits.tokensPerDay !== Infinity &&
            modelUsage.tokenCount + tokensNeeded > limits.tokensPerDay;
    }


    async updateDailyUsage(tokensUsed) {
        const today = getTodayDateString();
        const collection = getMongoCollection('models_limits');

        // Fetch the model usage document
        let modelUsage = await collection.findOne({ model: this.model });

        // If no document exists for the model, initialize one
        if (!modelUsage) {
            try {
                await collection.insertOne({
                    model: this.model,
                    requestCount: 1,
                    tokenCount: tokensUsed,
                    lastResetDate: today,
                    processingRequests: 0
                });
                return;
            } catch (error) {
                if (error.code === 11000) {
                    // Duplicate key error, document was inserted by another process
                    modelUsage = await collection.findOne({ model: this.model });
                } else {
                    throw error;
                }
            }
        }

        // Check if the counts need to be reset
        if (modelUsage.lastResetDate !== today) {
            // Reset counts and update lastResetDate
            await collection.updateOne(
                { model: this.model },
                {
                    $set: {
                        requestCount: 1,
                        tokenCount: tokensUsed,
                        lastResetDate: today,
                    },
                }
            );
        } else {
            // Increment counts
            await collection.updateOne(
                { model: this.model },
                {
                    $inc: { requestCount: 1, tokenCount: tokensUsed },
                }
            );
        }
    }

    cleanUpOldTimestamps(now) {
        const windowStart = now - 60 * 1000; // 60 seconds window

        // Remove requests outside the window
        this.requestTimestamps = this.requestTimestamps.filter(
            timestamp => timestamp > windowStart
        );

        // Remove tokens outside the window
        this.tokenTimestamps = this.tokenTimestamps.filter(
            entry => entry.timestamp > windowStart
        );
    }


    totalTokensInWindow() {
        return this.tokenTimestamps.reduce((sum, entry) => sum + entry.tokens, 0);
    }


    timeUntilNextRequestAllowed(now) {
        const windowStart = now - 60 * 1000; // 60 seconds window
        const oldestRequest = this.requestTimestamps[0];
        const oldestTokenEntry = this.tokenTimestamps[0]?.timestamp || now;

        const timeUntilRequestLimitResets = oldestRequest ? oldestRequest - windowStart : 0;
        const timeUntilTokenLimitResets = oldestTokenEntry ? oldestTokenEntry - windowStart : 0;

        return Math.max(timeUntilRequestLimitResets, timeUntilTokenLimitResets, 0);
    }

    async incrementProcessingRequests() {
        const collection = getMongoCollection('models_limits');

        await collection.updateOne(
            { model: this.model },
            { $inc: { processingRequests: 1 } },
            { upsert: true }
        );
    }

    async decrementProcessingRequests() {
        const collection = getMongoCollection('models_limits');

        await collection.updateOne(
            { model: this.model },
            { $inc: { processingRequests: -1 } }
        );
    }

    async getProcessingRequestsCount() {
        const collection = getMongoCollection('models_limits');

        const modelUsage = await collection.findOne({ model: this.model });
        return modelUsage?.processingRequests || 0;
    }

    static async resetAllProcessingRequests() {
        const collection = getMongoCollection('models_limits');
        await collection.updateMany(
            {},
            { $set: { processingRequests: 0 } }
        );
    }
}

export function getTodayDateString() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}