import { isTransientError } from "../utils/errorUtils";

export interface NavyUsageResponse {
  plan: string;
  limits: {
    tokens_per_day: number;
    rpm: number;
  };
  usage: {
    tokens_used_today: number;
    tokens_remaining_today: number;
    percent_used: number;
    resets_at_utc: string;
    resets_in_ms: number;
  };
  rate_limits: {
    per_minute: {
      limit: number;
      used: number;
      remaining: number;
      resets_in_ms: number;
    };
  };
  server_time_utc: string;
}

export type TaskType = 'VOICE' | 'IMAGE';

export class NavyService {
  private static readonly API_URL = 'https://api.navy/v1/usage';
  private static readonly VOICE_COST = 55000;
  private static readonly IMAGE_COST = 7500;

  /**
   * Fetches the current usage stats for a given API key.
   */
  static async getUsage(apiKey: string): Promise<NavyUsageResponse | null> {
    try {
      const response = await fetch(this.API_URL, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`[NavyService] Failed to fetch usage for key ending in ...${apiKey.slice(-4)}: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as NavyUsageResponse;
      return data;
    } catch (error) {
      console.error(`[NavyService] Usage fetch error for key ending in ...${apiKey.slice(-4)}:`, error);
      return null;
    }
  }

  /**
   * Executes a task using the best available key from the pool based on the task type.
   *
   * Strategy:
   * - VOICE: Prioritize keys with HIGHEST remaining tokens.
   * - IMAGE: Prioritize keys with LOWEST remaining tokens (but >= 7500).
   *
   * Error Handling:
   * - 5xx Errors: Retry with the next best key.
   * - 429/402 Errors (Quota/Rate Limit):
   *    - For VOICE: Fail immediately if the best key has insufficient quota (do not try smaller keys).
   *    - For IMAGE: Fail if the key is invalid, otherwise try next best?
   *      (Logic: if a small key fails, a larger key might succeed, so we can retry).
   */
  static async executeWithSmartAllocation<T>(
    apiKeys: string[],
    taskType: TaskType,
    operation: (apiKey: string) => Promise<T>
  ): Promise<T> {
    if (!apiKeys || apiKeys.length === 0) {
      throw new Error("No Navy API keys provided.");
    }

    // 1. Fetch fresh usage for all keys in parallel
    const usageMap = new Map<string, number>();

    await Promise.all(apiKeys.map(async (key) => {
        const stats = await this.getUsage(key);
        if (stats) {
            usageMap.set(key, stats.usage.tokens_remaining_today);
        } else {
            // If check fails, assume 0 to be safe, or exclude it?
            // Let's exclude it to prevent blind errors.
            console.warn(`[NavyService] Excluding key ...${key.slice(-4)} due to usage check failure.`);
        }
    }));

    if (usageMap.size === 0) {
         throw new Error("Failed to validate any Navy API keys.");
    }

    // 2. Sort keys based on task type
    const validKeys = Array.from(usageMap.keys());
    let sortedKeys: string[] = [];

    if (taskType === 'VOICE') {
        // Descending order (Highest tokens first)
        sortedKeys = validKeys.sort((a, b) => (usageMap.get(b) || 0) - (usageMap.get(a) || 0));

        // Filter out keys that definitely don't have enough (if we want to be strict before even trying)
        // But the prompt says "allocating duties...".
        // We will keep them in the list but the loop will handle the "don't retry smaller" logic.
    } else {
        // IMAGE: Ascending order (Lowest tokens first), but must be >= COST
        const cost = this.IMAGE_COST;
        const sufficientKeys = validKeys.filter(k => (usageMap.get(k) || 0) >= cost);

        // Sort sufficient keys by token count ASC
        sortedKeys = sufficientKeys.sort((a, b) => (usageMap.get(a) || 0) - (usageMap.get(b) || 0));

        if (sortedKeys.length === 0) {
            throw new Error(`No Navy keys have enough tokens for Image generation (Need ${cost}).`);
        }
    }

    // 3. Execute with Fallback Logic
    let lastError: unknown = new Error("No keys available.");

    for (let i = 0; i < sortedKeys.length; i++) {
        const key = sortedKeys[i];
        const tokens = usageMap.get(key) || 0;

        // Double check specifically for Voice if we want to enforce the "don't try smaller" rule strictly here?
        // The rule was: "If 429... do not try smaller keys". This implies we TRY the big one first.

        try {
            console.log(`[NavyService] Attempting ${taskType} with key ...${key.slice(-4)} (${tokens} tokens)`);
            return await operation(key);
        } catch (error: any) {
            lastError = error;

            // Check for 429 (Too Many Requests) or 402/403 (Quota/Payment)
            const isQuotaError = error?.status === 429 || error?.response?.status === 429 ||
                                 error?.status === 402 || error?.response?.status === 402 ||
                                 (error?.message && error.message.includes('Quota'));

            const isServerError = error?.status >= 500 || error?.response?.status >= 500;

            if (isQuotaError) {
                console.warn(`[NavyService] Key ...${key.slice(-4)} failed with Quota/Rate Limit.`);

                if (taskType === 'VOICE') {
                    // "If TTS and largest key shows 429... trying smaller keys is useless."
                    // Since we sorted DESC, any subsequent key is "smaller" (or equal).
                    // So we abort.
                    throw new Error(`Navy Voice generation failed: Best key exhausted quota (${tokens} tokens). Aborting per policy.`);
                }
                // For IMAGE: We sorted ASC. If a small key fails quota (maybe it was just on the edge?),
                // the next key is LARGER. So we CAN continue.
            } else if (isServerError) {
                console.warn(`[NavyService] Key ...${key.slice(-4)} failed with Server Error (5xx). Trying next...`);
                // Continue loop
            } else {
                // Other errors (400 Bad Request, 401 Unauthorized) -> Probably fatal for this key, try next?
                // If 401 (Invalid Key), definitely try next.
                console.warn(`[NavyService] Key ...${key.slice(-4)} failed with error: ${error.message}.`);
            }
        }
    }

    throw lastError;
  }
}
