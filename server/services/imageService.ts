import OpenAI from "openai";
import { KeyManager } from "../utils/keyManager";

export const ImageService = {
  /**
   * Generates an image using api.navy (OpenAI compatible).
   * Returns the base64 string of the image.
   */
  generateImage: async (keyManager: KeyManager, promptText: string): Promise<string | null> => {
    try {
      return await keyManager.executeWithRetry(async (apiKey) => {
        const openai = new OpenAI({
          apiKey: apiKey,
          baseURL: "https://api.navy/v1",
        });

        console.log(`[ImageService] Generating image with model: flux.2-dev`);

        const response = await openai.images.generate({
          model: "flux.2-dev",
          prompt: promptText,
          n: 1,
          size: "16:9" as any, // Cast to any because standard OpenAI types might not include "16:9"
        });

        const imageUrl = response.data && response.data[0] ? response.data[0].url : null;
        if (!imageUrl) {
          throw new Error("No image URL returned from api.navy");
        }

        // Fetch the image to convert to base64
        // We use the global fetch which should handle proxies if configured,
        // though api.navy might not need the proxy if it's direct.
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image from ${imageUrl}: ${imageResponse.statusText}`);
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');

        // Return with data URI prefix if needed, but saveImage likely expects raw base64 or handles the prefix.
        // Looking at saveImage logic: if (base64Data.includes(';base64,')) ... else it assumes raw.
        // So raw base64 is safer or we can prepend a generic png header.
        // api.navy likely returns PNG or JPG. Let's assume PNG for now or check headers.
        const contentType = imageResponse.headers.get('content-type') || 'image/png';
        return `data:${contentType};base64,${base64}`;
      });
    } catch (e: any) {
      console.error("Image Gen Error:", e);
      return null;
    }
  }
};
