import { expect, test, mock, describe, beforeEach, afterEach } from "bun:test";
import { NavyService } from "./navyService";

// Helper to mock fetch responses based on key
const mockFetch = (keyMap: Record<string, number>) => {
    return mock((url, options: any) => {
         const key = options.headers['Authorization'].split(' ')[1];
         const tokens = keyMap[key] ?? 0;

         return Promise.resolve({
             ok: true,
             json: () => Promise.resolve({
                 plan: "Free",
                 limits: { tokens_per_day: 150000, rpm: 20 },
                 usage: { tokens_used_today: 0, tokens_remaining_today: tokens, percent_used: 0, resets_at_utc: "2026-02-23T00:00:00.000Z", resets_in_ms: 16967822 },
                 rate_limits: { per_minute: { limit: 20, used: 0, remaining: 20, resets_in_ms: 0 } },
                 server_time_utc: "2026-02-22T19:17:12.178Z"
             })
         } as Response);
    });
};

describe("NavyService", () => {
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("getUsage returns parsed response", async () => {
    global.fetch = mockFetch({ "test-key": 150000 });

    const result = await NavyService.getUsage("test-key");
    expect(result).not.toBeNull();
    expect(result?.usage.tokens_remaining_today).toBe(150000);
  });

  test("executeWithSmartAllocation selects best key for VOICE (highest tokens)", async () => {
     global.fetch = mockFetch({
         'k1': 10000,
         'k2': 50000,
         'k3': 100000
     });

     const operation = mock((key) => Promise.resolve("success"));

     await NavyService.executeWithSmartAllocation(['k1', 'k2', 'k3'], 'VOICE', operation);

     // Should have picked k3 (highest)
     expect(operation).toHaveBeenCalledTimes(1);
     expect(operation).toHaveBeenCalledWith('k3');
  });

  test("executeWithSmartAllocation selects best key for IMAGE (lowest >= 7500)", async () => {
     global.fetch = mockFetch({
         'k1': 5000, // Too low
         'k2': 10000, // Good, lowest valid
         'k3': 100000 // Good, but higher
     });

     const operation = mock((key) => Promise.resolve("success"));

     await NavyService.executeWithSmartAllocation(['k1', 'k2', 'k3'], 'IMAGE', operation);

     // Should have picked k2 (lowest valid)
     expect(operation).toHaveBeenCalledTimes(1);
     expect(operation).toHaveBeenCalledWith('k2');
  });

  test("executeWithSmartAllocation falls back on 500 error", async () => {
     global.fetch = mockFetch({
         'k1': 10000,
         'k2': 50000,
         'k3': 100000
     });

     // First call (k3) fails with 500, second (k2) succeeds
     const operation = mock((key) => {
         if (key === 'k3') return Promise.reject({ status: 500 });
         return Promise.resolve("success");
     });

     await NavyService.executeWithSmartAllocation(['k1', 'k2', 'k3'], 'VOICE', operation);

     expect(operation).toHaveBeenCalledTimes(2);
     expect(operation).toHaveBeenCalledWith('k3');
     expect(operation).toHaveBeenCalledWith('k2');
  });

  test("executeWithSmartAllocation aborts on 429 for VOICE (strict)", async () => {
     global.fetch = mockFetch({
         'k1': 10000,
         'k2': 50000
     });

     // Best key (k2) fails with 429
     const operation = mock((key) => {
         if (key === 'k2') return Promise.reject({ status: 429 });
         return Promise.resolve("success");
     });

     try {
         await NavyService.executeWithSmartAllocation(['k1', 'k2'], 'VOICE', operation);
         expect(true).toBe(false); // Should not reach here
     } catch (e: any) {
         expect(e.message).toContain("Aborting per policy");
     }

     expect(operation).toHaveBeenCalledTimes(1); // Only tried k2
  });
});
