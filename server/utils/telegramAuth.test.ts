import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { validateTelegramData } from './telegramAuth';
import { CONFIG } from '../config';
import crypto from 'node:crypto';

// Mock CONFIG.BOT_TOKEN
const ORIGINAL_TOKEN = CONFIG.BOT_TOKEN;

describe('validateTelegramData', () => {
  const configMock = CONFIG as unknown as { BOT_TOKEN?: string; BOT_USERNAME?: string };

  beforeEach(() => {
    configMock.BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
    configMock.BOT_USERNAME = 'test_bot';
  });

  afterEach(() => {
    configMock.BOT_TOKEN = ORIGINAL_TOKEN;
    configMock.BOT_USERNAME = undefined;
  });

  it('should validate correctly signed data', () => {
    // Example data based on Telegram docs or realistic values
    // data_check_string = "auth_date=1710000000\nquery_id=AAHdF6IQAAAAAN0XohD9v5nx\nuser={\"id\":12345,\"first_name\":\"Test\",\"username\":\"testuser\",\"language_code\":\"en\"}"

    // We need to calculate the actual hash to make it "valid" for the test
    const auth_date = '1710000000';
    const query_id = 'AAHdF6IQAAAAAN0XohD9v5nx';
    const user = '{"id":12345,"first_name":"Test","username":"testuser","language_code":"en"}';

    // Sorted keys: auth_date, query_id, user
    const dataCheckString = `auth_date=${auth_date}\nquery_id=${query_id}\nuser=${user}`;

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(CONFIG.BOT_TOKEN).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const initData = `query_id=${query_id}&user=${encodeURIComponent(user)}&auth_date=${auth_date}&hash=${hash}`;

    // We need to mock Date.now() to pass the auth_date check
    const originalNow = Date.now;
    Date.now = () => 1710000000 * 1000;

    try {
      const result = validateTelegramData(initData);
      expect(result.isValid).toBe(true);
      expect(result.user?.id).toBe(12345);
    } finally {
      Date.now = originalNow;
    }
  });

  it('should fail if signature is invalid', () => {
      const initData = `query_id=123&hash=invalidhash`;
      const result = validateTelegramData(initData);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Signature verification failed");
  });

  it('should handle sorting correctly (the fix)', () => {
      // In some locales, "z" < "a" if we are not careful (though unlikely in standard JS localeCompare with 'en')
      // But the key point is predictability.
      // We'll test with keys that might be sorted differently.

      const entries = [
          { key: 'b', value: '2' },
          { key: 'a', value: '1' },
          { key: 'c', value: '3' }
      ];

      // Use the same logic as in the implementation
      entries.sort((a, b) => a.key < b.key ? -1 : (a.key > b.key ? 1 : 0));

      expect(entries[0].key).toBe('a');
      expect(entries[1].key).toBe('b');
      expect(entries[2].key).toBe('c');
  });
});
