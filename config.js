import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
    PORT: 5555,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    UPLOAD_DIR: 'uploads/',
    DEFAULT_MODEL: 'gpt-4o-mini'
};
