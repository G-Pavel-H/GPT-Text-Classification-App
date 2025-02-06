import { CONFIG } from '../config.js';
import { getMongoCollection } from '../db.js';

export class UserSpendingTracker {

    static async createIndexes() {
        const collection = getMongoCollection('user_progress');
        await collection.createIndex({ userId: 1 }, { unique: true });
        await collection.createIndex({ ipAddress: 1 });
    }

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

    static async updateProcessingProgress(userId, ipAddress, processedRows, totalRows, phase = 'processing') {
        const collection = getMongoCollection('user_progress');

        try {
            await collection.updateOne(
                { userId },
                {
                    $set: {
                        ipAddress,
                        processedRows,
                        totalRows,
                        lastUpdateTime: new Date(),
                        processingActive: true,
                        currentPhase: phase
                    }
                }
            );
            return true;
        } catch (error) {
            console.error('Error updating processing progress:', error);
            return false;
        }
    }


    static async getProcessingProgress(userId) {
        const collection = getMongoCollection('user_progress');

        try {
            const userDoc = await collection.findOne({
                userId,
            });

            return {
                processedRows: userDoc?.processedRows || 0,
                totalRows: userDoc?.totalRows || 0,
                lastUpdateTime: userDoc?.lastUpdateTime,
                processingActive: userDoc?.processingActive || false,
                currentPhase: userDoc?.currentPhase || 'processing' // Add this line
            };
        } catch (error) {
            console.error('Error getting processing progress:', error);
            return {
                processedRows: 0,
                totalRows: 0,
                processingActive: false,
                currentPhase: 'processing' // Add this line
            };
        }
    }


    static async initializeProcessing(userId, ipAddress, totalRows, phase = 'processing') {
        const collection = getMongoCollection('user_progress');

        try {
            await collection.updateOne(
                { userId },
                {
                    $set: {
                        ipAddress,
                        processedRows: 0,
                        totalRows,
                        lastUpdateTime: new Date(),
                        processingActive: true,
                        currentPhase: phase
                    }
                },
                { upsert: true }
            );
            return true;
        } catch (error) {
            console.error('Error initializing processing:', error);
            return false;
        }
    }

    static async finalizeProcessing(userId) {
        const collection = getMongoCollection('user_progress');

        try {
            await collection.updateOne(
                { userId },
                {
                    $set: {
                        lastUpdateTime: new Date(),
                        processingActive: false
                    }
                }
            );
            return true;
        } catch (error) {
            console.error('Error finalizing processing:', error);
            return false;
        }
    }
}
