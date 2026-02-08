import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const GENERATED_DIR = path.join(process.cwd(), 'public', 'generated');

export async function saveImage(base64Data: string): Promise<string> {
    try {
        // Ensure directory exists
        await fs.mkdir(GENERATED_DIR, { recursive: true });

        // Remove header if present (data:image/xyz;base64,)
        const base64Image = base64Data.split(';base64,').pop();

        if (!base64Image) {
            throw new Error("Invalid base64 data");
        }

        const filename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.webp`;
        const filepath = path.join(GENERATED_DIR, filename);

        await fs.writeFile(filepath, base64Image, { encoding: 'base64' });

        return `/generated/${filename}`;
    } catch (error) {
        console.error("Failed to save image:", error);
        throw error;
    }
}
