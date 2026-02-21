import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const GENERATED_DIR = path.join(process.cwd(), 'public', 'generated');
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours retention

export async function saveImage(base64Data: string): Promise<string> {
    try {
        await fs.mkdir(GENERATED_DIR, { recursive: true });

        // Detect extension from base64 header (e.g., data:image/png;base64,...)
        let extension = 'png'; // Default
        let base64Image = base64Data;

        if (base64Data.includes(';base64,')) {
            const parts = base64Data.split(';base64,');
            const header = parts[0];
            base64Image = parts[1];

            if (header.includes('image/jpeg')) extension = 'jpg';
            else if (header.includes('image/webp')) extension = 'webp';
            else if (header.includes('image/png')) extension = 'png';
        }

        if (!base64Image) {
            throw new Error("Invalid base64 data");
        }

        const filename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${extension}`;
        const filepath = path.join(GENERATED_DIR, filename);

        await fs.writeFile(filepath, base64Image, { encoding: 'base64' });

        return `/generated/${filename}`;
    } catch (error) {
        console.error("Failed to save image:", error);
        throw error;
    }
}

export async function saveAudio(buffer: Buffer): Promise<string> {
    try {
        await fs.mkdir(GENERATED_DIR, { recursive: true });
        
        const filename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.mp3`;
        const filepath = path.join(GENERATED_DIR, filename);

        await fs.writeFile(filepath, buffer);

        return `/generated/${filename}`;
    } catch (error) {
        console.error("Failed to save audio:", error);
        throw error;
    }
}

export async function cleanupOldFiles() {
    try {
        const files = await fs.readdir(GENERATED_DIR);
        const now = Date.now();
        let deletedCount = 0;

        for (const file of files) {
            const filepath = path.join(GENERATED_DIR, file);
            try {
                const stats = await fs.stat(filepath);
                if (now - stats.mtimeMs > MAX_AGE_MS) {
                    await fs.unlink(filepath);
                    deletedCount++;
                }
            } catch (err) {
                console.warn(`Failed to process file ${file} for cleanup:`, err);
            }
        }
        if (deletedCount > 0) {
            console.log(`[FileCleanup] Removed ${deletedCount} old files.`);
        }
    } catch (error) {
        // Directory might not exist yet, which is fine
        if ((error as any).code !== 'ENOENT') {
            console.error("File cleanup failed:", error);
        }
    }
}
