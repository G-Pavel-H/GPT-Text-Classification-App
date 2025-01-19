import { CONFIG } from '../config.js';
import { getMongoCollection } from '../db.js';

export class UserSpendingTracker {
    static DAILY_SPENDING_LIMIT = CONFIG.DAILY_SPENDING_LIMIT;

    static async recordUserSpending(ipAddress, amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            console.error('Invalid amount provided:', amount);
            return false;
        }

        const collection = getMongoCollection('user_spending');
        const today = this.getTodayDateString();

        try {
            const existingDoc = await collection.findOne({ ipAddress });

            if (!existingDoc) {
                const result = await collection.findOneAndUpdate(
                    { ipAddress },
                    {
                        $set: {
                            ipAddress,
                            date: today,
                            totalSpent: amount
                        }
                    },
                    {
                        upsert: true,
                        returnDocument: 'after'
                    }
                );
                return result.totalSpent <= this.DAILY_SPENDING_LIMIT;
            }

            if (existingDoc.date !== today) {
                const result = await collection.findOneAndUpdate(
                    { ipAddress },
                    {
                        $set: {
                            date: today,
                            totalSpent: amount,
                        }
                    },
                    { returnDocument: 'after' }
                );
                return result.totalSpent <= this.DAILY_SPENDING_LIMIT;
            }

            const result = await collection.findOneAndUpdate(
                { ipAddress, date: today },
                { $inc: { totalSpent: amount } },
                { returnDocument: 'after' }
            );


            return result.totalSpent <= this.DAILY_SPENDING_LIMIT;
        } catch (error) {
            console.error('Error recording user spending:', error);
            return false;
        }
    }

    static async getUserDailySpending(ipAddress) {
        if (!ipAddress) {
            console.error('No IP address provided');
            return 0;
        }

        const collection = getMongoCollection('user_spending');
        const today = this.getTodayDateString();

        try {
            const userSpending = await collection.findOne({
                ipAddress,
                date: today
            });

            return userSpending?.totalSpent || 0;
        } catch (error) {
            console.error('Error getting user daily spending:', error);
            return 0;
        }
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
        const ipAddress = req.ip;
        const estimatedCost = parseFloat(req.body.estimatedCost || 0);

        if (isNaN(estimatedCost)) {
            return res.status(400).json({
                error: 'Invalid cost estimate provided'
            });
        }

        try {
            const dailySpending = await UserSpendingTracker.getUserDailySpending(ipAddress);
            const newTotalSpending = dailySpending + estimatedCost;

            if (newTotalSpending > UserSpendingTracker.DAILY_SPENDING_LIMIT) {
                return res.status(403).json({
                    error: 'Daily spending limit exceeded',
                    currentSpending: dailySpending,
                    limit: UserSpendingTracker.DAILY_SPENDING_LIMIT
                });
            }

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
                const success = await UserSpendingTracker.recordUserSpending(
                    req.userSpending.ipAddress,
                    req.userSpending.estimatedCost
                );

                if (!success) {
                    console.error('Failed to record spending');
                }
            } catch (error) {
                console.error('Error recording spending:', error);
            }
        }
        next();
    }
}