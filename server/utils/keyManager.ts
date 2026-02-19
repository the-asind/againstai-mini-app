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
    // 1. Try Primary Key First
    try {
      return await operation(this.primaryKey);
    } catch (error: any) {
      if (!this.isTransientError(error)) throw error;
      console.warn("[KeyManager] Primary key failed with transient error. Switching to backup pool.");
    }

    // 2. Try Pool Keys
    // Create a local copy of the pool to track usage within this specific execution attempt
    const currentPool = [...this.pool];
    let attemptCount = 1;

    while (currentPool.length > 0) {
      // Pick a random key from the remaining pool
      const randomIndex = Math.floor(Math.random() * currentPool.length);
      const key = currentPool[randomIndex];

      // Remove it from the local pool so we don't try it again in this cycle
      currentPool.splice(randomIndex, 1);

      // Backoff: 2^attempt * 1000ms (2s, 4s, 8s...)
      const delay = Math.pow(2, attemptCount) * 1000;
      console.log(`[KeyManager] Retrying with backup key in ${delay}ms...`);

      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        return await operation(key);
      } catch (error: any) {
        if (!this.isTransientError(error)) throw error;
        console.warn(`[KeyManager] Backup key failed. ${currentPool.length} keys remaining.`);
        attemptCount++;
      }
    }

    throw new Error("All API keys (Primary + Pool) exhausted or failed.");
  }

  private isTransientError(error: any): boolean {
    const status = error.status || error.response?.status || error.code;
    return (
      status === 503 ||
      status === 429 ||
      status === 'UNAVAILABLE' ||
      (error.message && error.message.includes('overloaded'))
    );
  }
}
