// db.js
import { MongoClient } from 'mongodb';
import {getTodayDateString} from "./models/RateLimiter.js";
import {CONFIG} from "./config.js";

let client;
let db;

export async function connectToDatabase(uri) {
    if (!client) {
        client = new MongoClient(uri);
        await client.connect();
        db = client.db('rate_limiter');
    }
    return db;
}

export function getMongoCollection(collectionName) {
    if (!db) {
        throw new Error('Database not connected. Call connectToDatabase first.');
    }
    return db.collection(collectionName);
}

