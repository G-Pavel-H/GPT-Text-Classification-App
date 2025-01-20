import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
    PORT: 5555,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    MONGO_DB_URI: process.env.MONGODB_ATLAS_URI,
    UPLOAD_DIR: 'uploads/',
    DEFAULT_MODEL: 'gpt-4o-mini',
    concurrency_level_api: 5,
    DAILY_SPENDING_LIMIT : 0.5,
};
console.error(CONFIG.MONGO_DB_URI);