"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
// Load env vars
dotenv_1.default.config();
exports.CONFIG = {
    PORT: process.env.PORT || 3000,
    BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    // Default models if not specified in env
    MODELS: {
        FAST: process.env.GEMINI_MODEL_FAST || 'gemini-3-flash-preview',
        SMART: process.env.GEMINI_MODEL_SMART || 'gemini-3-pro-preview'
    }
};
//# sourceMappingURL=config.js.map