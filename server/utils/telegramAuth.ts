import crypto from 'crypto';
import { CONFIG } from '../config';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

/**
 * Validates the data received from Telegram Web App.
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export const validateTelegramData = (initData: string): { isValid: boolean; user?: TelegramUser; error?: string } => {
  // If we are in a dev environment without a token, strictly reject because requirement is "secure".
  // However, we need to allow testing. But the user said "Strictly by documentation".
  // So if no token, we can't validate, so it is invalid.
  if (!CONFIG.BOT_TOKEN) {
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
  const params: string[] = [];
  // Iterator order is not guaranteed to be sorted, so we get entries, sort them, then join.
  // Actually URLSearchParams doesn't guarantee order. We need to collect, sort, then build string.

  // Convert to array of [key, value]
  const entries: {key: string, value: string}[] = [];
  urlParams.forEach((value, key) => {
      entries.push({ key, value });
  });

  // Sort by key
  entries.sort((a, b) => a.key.localeCompare(b.key));

  // Construct data-check-string
  const dataCheckString = entries.map(({key, value}) => `${key}=${value}`).join('\n');

  // HMAC-SHA256 signature
  // Secret key is HMAC_SHA256(bot_token, "WebAppData")
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(CONFIG.BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Constant time comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(
      Buffer.from(calculatedHash),
      Buffer.from(hash)
  );

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
  let user: TelegramUser | undefined;
  if (userStr) {
      try {
          user = JSON.parse(userStr);
      } catch (e) {
          return { isValid: false, error: "Malformed user JSON" };
      }
  }

  return { isValid: true, user };
};
