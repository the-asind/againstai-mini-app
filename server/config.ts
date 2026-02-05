import dotenv from 'dotenv';

// Load env vars
dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT || 3000,
  BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  // Default models if not specified in env
  MODELS: {
    FAST: process.env.GEMINI_MODEL_FAST || 'gemini-2.0-flash',
    SMART: process.env.GEMINI_MODEL_SMART || 'gemini-1.5-pro'
  }
};
