// db.js
import { MongoClient } from 'mongodb';

let client;
let db;

export async function connectToDatabase(uri) {
    try {
        if (!client) {
            // Create MongoDB client with options recommended for Atlas
            client = new MongoClient(uri, {
                maxPoolSize: 50,
                wtimeoutMS: 2500,
                retryWrites: true,
                retryReads: true
            });

            // Connect to the cluster
            await client.connect();

            // Get database reference
            db = client.db('rate_limiter');

            // Test the connection
            await db.command({ ping: 1 });
            console.log("Successfully connected to MongoDB Atlas");
        }
        return db;
    } catch (error) {
        console.error("Error connecting to MongoDB Atlas:", error);
        throw error;
    }
}

export function getMongoCollection(collectionName) {
    if (!db) {
        throw new Error('Database not connected. Call connectToDatabase first.');
    }
    return db.collection(collectionName);
}

// Add a cleanup function for graceful shutdown
export async function closeConnection() {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.log("MongoDB connection closed");
    }
}

