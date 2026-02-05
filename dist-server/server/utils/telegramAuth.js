"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTelegramData = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
/**
 * Validates the data received from Telegram Web App.
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
const validateTelegramData = (initData) => {
    // If we are in a dev environment without a token, strictly reject because requirement is "secure".
    // However, we need to allow testing. But the user said "Strictly by documentation".
    // So if no token, we can't validate, so it is invalid.
    if (!config_1.CONFIG.BOT_TOKEN) {
        console.warn("Telegram Bot Token is missing in server config.");
        return { isValid: false, error: "Server missing Bot Token" };
    }
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) {
        return { isValid: false, error: "Missing hash parameter" };
    }
    // To validate, we must remove 'hash' from the data check string
    urlParams.delete('hash');
    // Sort keys alphabetically
    const params = [];
    // Iterator order is not guaranteed to be sorted, so we get entries, sort them, then join.
    // Actually URLSearchParams doesn't guarantee order. We need to collect, sort, then build string.
    // Convert to array of [key, value]
    const entries = [];
    urlParams.forEach((value, key) => {
        entries.push({ key, value });
    });
    // Sort by key
    entries.sort((a, b) => a.key.localeCompare(b.key));
    // Construct data-check-string
    const dataCheckString = entries.map(({ key, value }) => `${key}=${value}`).join('\n');
    // HMAC-SHA256 signature
    // Secret key is HMAC_SHA256(bot_token, "WebAppData")
    const secretKey = crypto_1.default
        .createHmac('sha256', 'WebAppData')
        .update(config_1.CONFIG.BOT_TOKEN)
        .digest();
    const calculatedHash = crypto_1.default
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');
    // Constant time comparison to prevent timing attacks
    const isValid = crypto_1.default.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
    if (!isValid) {
        return { isValid: false, error: "Signature verification failed" };
    }
    // Check auth_date (prevent replay attacks > 24h)
    const authDate = urlParams.get('auth_date');
    if (authDate) {
        const authTimestamp = parseInt(authDate, 10);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        // Allow some clock skew (e.g. 5 min future) and max 24h past
        if (currentTimestamp - authTimestamp > 86400) {
            return { isValid: false, error: "Data is outdated (>24h)" };
        }
    }
    // Parse User Data
    const userStr = urlParams.get('user');
    let user;
    if (userStr) {
        try {
            user = JSON.parse(userStr);
        }
        catch (e) {
            return { isValid: false, error: "Malformed user JSON" };
        }
    }
    return { isValid: true, user };
};
exports.validateTelegramData = validateTelegramData;
//# sourceMappingURL=telegramAuth.js.map