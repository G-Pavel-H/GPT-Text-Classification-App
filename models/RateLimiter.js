import { CONFIG } from '../config.js';

export class RateLimiter {
    // Rate limit configurations for different models
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
        'gpt-3.5-turbo': {
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
            requestsPerDay: Infinity // Not specified in the original table
        }
    };

    constructor(model = CONFIG.DEFAULT_MODEL) {
        this.model = model;
        this.limits = RateLimiter.RATE_LIMITS[this.model];

        // Arrays to hold timestamps of requests and tokens used within the last minute
        this.requestTimestamps = [];
        this.tokenTimestamps = [];

        // Track daily usage
        this.dailyRequestCount = 0;
        this.dailyTokenCount = 0;
        this.dailyTimestamp = Date.now();
    }

    /**
     * Waits until the rate limits allow for a new request
     * @param {number} tokensNeeded Number of tokens needed for the request
     * @returns {Promise<void>}
     */
    async waitForRateLimit(tokensNeeded) {
        const now = Date.now();

        this.cleanUpOldTimestamps(now);

        while (
            this.requestTimestamps.length >= this.limits.requestsPerMinute ||
            this.totalTokensInWindow() + tokensNeeded > this.limits.tokensPerMinute
            ) {
            const timeUntilNextRequest = this.timeUntilNextRequestAllowed(now);
            console.warn(`Rate limit reached. Waiting ${timeUntilNextRequest}ms...`);
            await new Promise(resolve => setTimeout(resolve, timeUntilNextRequest));

            const newNow = Date.now();
            this.cleanUpOldTimestamps(newNow);
        }

        // Record the new request and tokens
        this.requestTimestamps.push(now);
        this.tokenTimestamps.push({ timestamp: now, tokens: tokensNeeded });

        // Update daily usage
        this.updateDailyUsage(tokensNeeded);
    }

    /**
     * Checks if the daily limits would be exceeded
     * @param {number} tokensNeeded Tokens needed for the request
     * @param {number} requestsNeeded Number of requests (usually 1)
     * @returns {boolean} Whether daily limits are exceeded
     */
    isDailyLimitExceeded(tokensNeeded, requestsNeeded) {
        const now = Date.now();
        const dayElapsed = now - this.dailyTimestamp > 24 * 60 * 60 * 1000;

        // Reset daily usage if 24 hours have passed
        if (dayElapsed) {
            this.dailyRequestCount = 0;
            this.dailyTokenCount = 0;
            this.dailyTimestamp = now;
        }

        const limits = this.limits;

        // Check daily requests limit
        if (
            limits.requestsPerDay !== Infinity &&
            this.dailyRequestCount + requestsNeeded > limits.requestsPerDay
        ) {
            return true;
        }

        // Check daily tokens limit
        if (
            limits.tokensPerDay !== Infinity &&
            this.dailyTokenCount + tokensNeeded > limits.tokensPerDay
        ) {
            return true;
        }

        return false;
    }

    /**
     * Updates daily usage counters
     * @param {number} tokensUsed Number of tokens used
     */
    updateDailyUsage(tokensUsed) {
        this.dailyRequestCount += 1;
        this.dailyTokenCount += tokensUsed;
    }

    /**
     * Cleans up old timestamps outside of the rate limit window
     * @param {number} now Current timestamp
     */
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

    /**
     * Calculates total tokens used within the rate limit window
     * @returns {number}
     */
    totalTokensInWindow() {
        return this.tokenTimestamps.reduce((sum, entry) => sum + entry.tokens, 0);
    }

    /**
     * Calculates the minimum time until the next request is allowed
     * @param {number} now Current timestamp
     * @returns {number} Time in milliseconds
     */
    timeUntilNextRequestAllowed(now) {
        const windowStart = now - 60 * 1000; // 60 seconds window
        const oldestRequest = this.requestTimestamps[0];
        const oldestTokenEntry = this.tokenTimestamps[0]?.timestamp || now;

        const timeUntilRequestLimitResets = oldestRequest ? oldestRequest - windowStart : 0;
        const timeUntilTokenLimitResets = oldestTokenEntry ? oldestTokenEntry - windowStart : 0;

        return Math.max(timeUntilRequestLimitResets, timeUntilTokenLimitResets, 0);
    }
    /**
     * Update trackers after a successful request
     * @param {number} tokens Tokens used in the request
     * @param {number} numRows Number of rows processed
     */
    updateTrackers(tokens, numRows) {
        const now = Date.now();

        // Update minute tracker
        if (now - this.tokenTracker.minute.timestamp > 60 * 1000) {
            this.tokenTracker.minute = { count: 0, timestamp: now };
        }
        this.tokenTracker.minute.count += numRows;

        // Update daily tracker
        if (now - this.tokenTracker.day.timestamp > 24 * 60 * 60 * 1000) {
            this.tokenTracker.day = { count: 0, timestamp: now };
        }
        this.tokenTracker.day.count += numRows;
    }
}