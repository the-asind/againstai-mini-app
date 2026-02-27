import { isTransientError } from "./errorUtils";

export class KeyManager {
  private primaryKey: string;
  private readonly pool: string[];

  constructor(primaryKey: string, otherKeys: string[]) {
    this.primaryKey = primaryKey;
    this.pool = [...otherKeys];
  }

  /**
   * Executes an operation with automatic key rotation on transient errors (429, 503).
   * Restores the full pool for each new operation call.
   */
  async executeWithRetry<T>(operation: (key: string) => Promise<T>): Promise<T> {
    const keysToTry = [this.primaryKey, ...this.pool];
    let lastError: unknown;

    for (const key of keysToTry) {
      let attemptCount = 1;
      const MAX_ATTEMPTS_PER_KEY = 4; // 1 initial + 3 retries

      while (attemptCount <= MAX_ATTEMPTS_PER_KEY) {
        try {
          return await operation(key);
        } catch (error: any) {
          if (!isTransientError(error)) throw error;
          lastError = error;

          const status = error?.status || error?.response?.status;

          if (attemptCount === MAX_ATTEMPTS_PER_KEY) {
            console.warn(`[KeyManager] Key exhausted after ${MAX_ATTEMPTS_PER_KEY} attempts.`);
            break; // Try next key
          }

          if (status === 429) {
            // For 429, wait a fixed small amount and try the NEXT key in the pool
            console.log(`[KeyManager] 429 Quota Exceeded. Trying next key after 500ms delay...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            break; // Exit the while loop to move to the next key in the `for` loop
          } else {
            // 503 or other transient error: Exponential backoff on the SAME key
            const baseDelay = Math.pow(2, attemptCount) * 1000;
            const jitter = Math.random() * 1000;
            const delay = baseDelay + jitter;

            console.log(`[KeyManager] Transient error ${status || ''}. Retrying SAME key in ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            attemptCount++;
          }
        }
      }
    }

    throw new Error(`All API keys exhausted or failed. Last error: ${lastError instanceof Error ? lastError.message : 'Unknown'}`);
  }
}
