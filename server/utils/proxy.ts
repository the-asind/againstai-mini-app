import { ProxyAgent, fetch as undiciFetch } from 'undici';

/**
 * Sets up a global fetch proxy if HTTPS_PROXY or HTTP_PROXY environment variables are present.
 * This is necessary because Node.js native fetch does not automatically use system proxies.
 */
export const setupProxy = () => {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

  if (proxyUrl) {
    const dispatcher = new ProxyAgent(proxyUrl);

    // Setup Global Fetch Patch for SDKs (like Gemini)
    globalThis.fetch = (input: any, init?: any) => {
      return undiciFetch(input, { ...init, dispatcher }) as unknown as Promise<Response>;
    };
  }
};
