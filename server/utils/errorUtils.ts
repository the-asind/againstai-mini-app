/**
 * Checks if an error is transient (e.g. 429, 503, Overloaded) and should be retried.
 */
export function isTransientError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const e = error as any;
    const status = e.status || e.response?.status || e.code;
    const message = e.message || '';

    return (
      status === 503 ||
      status === 429 ||
      status === 'UNAVAILABLE' ||
      (typeof message === 'string' && message.toLowerCase().includes('overloaded'))
    );
}
