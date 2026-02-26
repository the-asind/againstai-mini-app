import dotenv from 'dotenv';

// Load env vars
dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT || 3000,
  BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  // Default models if not specified in env
  MODELS: {
    FAST: process.env.GEMINI_MODEL_FAST || 'gemini-3-flash-preview',
    SMART: process.env.GEMINI_MODEL_SMART || 'gemini-3.1-pro-preview',
    IMAGE: process.env.GEMINI_MODEL_IMAGE || 'gemini-2.5-flash-image'
  },
  // AI Levels
  AI_LEVELS: {
    economy: {
        FAST: process.env.AI_LEVEL_1_FAST || 'gemini-2.5-flash-lite-preview-09-2025',
        SMART: process.env.AI_LEVEL_1_SMART || 'gemini-2.5-flash-lite-preview-09-2025'
    },
    balanced: {
        FAST: process.env.AI_LEVEL_2_FAST || 'gemini-3-flash-preview',
        SMART: process.env.AI_LEVEL_2_SMART || 'gemini-3-flash-preview'
    },
    premium: {
        FAST: process.env.AI_LEVEL_3_FAST || 'gemini-3-flash-preview',
        SMART: process.env.AI_LEVEL_3_SMART || 'gemini-3.1-pro-preview'
    }
  }
};
