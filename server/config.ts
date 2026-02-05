import dotenv from 'dotenv';

// Load env vars
dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT || 3000,
  BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  GEMINI_BIND_INTERFACE: process.env.GEMINI_BIND_INTERFACE || '',
  // Default models if not specified in env
  MODELS: {
    FAST: process.env.GEMINI_MODEL_FAST || 'gemini-3-flash-preview',
    SMART: process.env.GEMINI_MODEL_SMART || 'gemini-3-pro-preview'
  }
};
