import { CONFIG } from '../config.js';
import { getMongoCollection } from '../db.js';

export class UserSpendingTracker {
    static DAILY_SPENDING_LIMIT = CONFIG.DAILY_SPENDING_LIMIT;

    static async recordUserSpending(ipAddress, amount) {
        const collection = getMongoCollection('user_spending');
        const today = this.getTodayDateString();

        try {
            // Find or create user spending record
            const query = { ipAddress, date: today };
            const update = {
                $inc: { totalSpent: amount },
                $setOnInsert: { date: today, ipAddress }
            };
            const options = { upsert: true, returnDocument: 'after' };

            const result = await collection.findOneAndUpdate(query, update, options);

            // Check if daily limit is exceeded
            return result.totalSpent <= this.DAILY_SPENDING_LIMIT;
        } catch (error) {
            console.error('Error recording user spending:', error);
            return false;
        }
    }

    static async getUserDailySpending(ipAddress) {
        const collection = getMongoCollection('user_spending');
        const today = this.getTodayDateString();

        const userSpending = await collection.findOne({
            ipAddress,
            date: today
        });

        return userSpending ? userSpending.totalSpent : 0;
    }

    static getTodayDateString() {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

export class SpendingLimitMiddleware {
    static async checkSpendingLimit(req, res, next) {
        const ipAddress = req.ip; // Express provides this
        const estimatedCost = parseFloat(req.body.estimatedCost || 0);

        try {
            const dailySpending = await UserSpendingTracker.getUserDailySpending(ipAddress);
            const newTotalSpending = dailySpending + estimatedCost;
            console.warn(dailySpending);

            if (newTotalSpending > UserSpendingTracker.DAILY_SPENDING_LIMIT) {
                return res.status(403).json({
                    error: 'Daily spending limit exceeded',
                    currentSpending: dailySpending,
                    limit: UserSpendingTracker.DAILY_SPENDING_LIMIT
                });
            }

            // Attach spending information to the request for later use
            req.userSpending = { ipAddress, estimatedCost };
            next();
        } catch (error) {
            console.error('Spending limit check error:', error);
            res.status(500).json({ error: 'Internal server error checking spending limit' });
        }
    }

    static async recordSpending(req, res, next) {
        if (req.userSpending) {
            try {
                await UserSpendingTracker.recordUserSpending(
                    req.userSpending.ipAddress,
                    req.userSpending.estimatedCost
                );
            } catch (error) {
                console.error('Error recording spending:', error);
            }
        }
        next();
    }
}