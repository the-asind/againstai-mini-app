import OpenAI from "openai";
import { KeyManager } from "../utils/keyManager";

export const ImageService = {
  generateImage: async (keyOrManager: KeyManager | string, prompt: string): Promise<string | null> => {
    try {
        const operation = async (apiKey: string): Promise<string | null> => {
            console.log(`[ImageService] Generating image...`);

            const openai = new OpenAI({
                apiKey: apiKey,
                baseURL: "https://api.navy/v1",
            });

            const response = await openai.images.generate({
                model: "flux-pro-1.1-ultra",
                prompt: prompt,
                n: 1,
                size: "1024x1024",
                response_format: "b64_json",
            });

            const b64 = response.data[0].b64_json;
            if (b64) {
                 console.log(`[ImageService] Image generated.`);
                 return b64;
            }
            return null;
        };

        if (typeof keyOrManager === 'string') {
            return await operation(keyOrManager);
        } else {
            return await keyOrManager.executeWithRetry(operation);
        }
    } catch (e) {
        console.error("Image Generation Failed:", e);
        return null;
    }
  }
};
