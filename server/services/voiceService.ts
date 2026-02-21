import OpenAI from "openai";
import { KeyManager } from "../utils/keyManager";
import { saveAudio } from "../utils/fileStorage";

export const VoiceService = {
  generateVoice: async (keyManager: KeyManager, text: string): Promise<string | null> => {
    try {
        return await keyManager.executeWithRetry(async (apiKey) => {
            console.log(`[VoiceService] Generating voice for text length: ${text.length}`);
            
            const openai = new OpenAI({
                apiKey: apiKey,
                baseURL: "https://api.navy/v1",
            });

            const mp3 = await openai.audio.speech.create({
                model: "eleven_v3",
                voice: "TUQNWEvVPBLzMBSVDPUA",
                input: text,
            });

            const buffer = Buffer.from(await mp3.arrayBuffer());
            const url = await saveAudio(buffer);
            console.log(`[VoiceService] Voice generated: ${url}`);
            return url;
        });
    } catch (e) {
        console.error("Voice Generation Failed:", e);
        return null;
    }
  }
};
