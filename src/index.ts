import type { Request, Response } from 'express';
import express from 'express';
import { createClient } from 'redis';
import sharp from 'sharp';

const app = express();
const port = process.env.PORT || 3000;

let redis: ReturnType<typeof createClient> | null = null;
let isCacheEnabled = false;

// Initialize Redis if URL is provided
async function initializeCache() {
    try {
        if (process.env.REDIS_URL) {
            redis = createClient({
                url: process.env.REDIS_URL
            });

            await redis.connect();
            isCacheEnabled = true;
            console.log('✅ Redis cache enabled');
        } else {
            console.log('ℹ️ Redis cache disabled (REDIS_URL not set)');
        }
    } catch (error) {
        console.error('❌ Redis connection failed:', error);
        redis = null;
        isCacheEnabled = false;
    }
}

initializeCache();

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

app.get('/:src', async (req: Request, res: Response) => {
    try {
        const src = decodeURIComponent(req.params.src);
        const width = req.query.w as string | undefined;
        const quality = (req.query.q as string) || '75';

        if (!src) {
            return res.status(400).json({ error: 'Source URL is required' });
        }

        // Try cache if Redis is available
        if (isCacheEnabled && redis) {
            const cacheKey = `img:${src}:w=${width}:q=${quality}`;
            const cachedImage = await redis.get(cacheKey);

            if (cachedImage) {
                console.log('Cache hit:', cacheKey);
                res.set('Content-Type', 'image/webp');
                res.set('X-Cache', 'HIT');
                return res.send(Buffer.from(cachedImage, 'base64'));
            }
        }

        // Use Bun's native fetch
        const imageResponse = await fetch(src);
        if (!imageResponse.ok) {
            return res.status(404).json({ error: 'Image not found' });
        }

        const originalBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const originalSize = originalBuffer.length;

        // Process the image with sharp
        let imageProcess = sharp(originalBuffer);

        // Resize if width is provided
        if (width) {
            const parsedWidth = parseInt(width);
            if (!isNaN(parsedWidth)) {
                imageProcess = imageProcess.resize(parsedWidth);
            }
        }

        // Set quality and convert to WebP
        const q = parseInt(quality);
        if (!isNaN(q) && q >= 0 && q <= 100) {
            imageProcess = imageProcess.webp({ quality: q });
        }

        // Get the processed buffer
        const processedImage = await imageProcess.toBuffer();
        const optimizedSize = processedImage.length;
        const savings = ((originalSize - optimizedSize) / originalSize * 100).toFixed(2);

        console.log(`Image: ${src}`);
        console.log(`Original size: ${(originalSize / 1024).toFixed(2)} KB`);
        console.log(`Optimized size: ${(optimizedSize / 1024).toFixed(2)} KB`);
        console.log(`Saved: ${savings}%`);

        // Cache the optimized image if Redis is available
        if (isCacheEnabled && redis) {
            const cacheKey = `img:${src}:w=${width}:q=${quality}`;
            await redis.set(cacheKey, processedImage.toString('base64'), {
                EX: 60 * 60 * 24 * 7 // Cache for 7 days
            });
            res.set('X-Cache', 'MISS');
        }

        // Send the optimized image
        res.set('Content-Type', 'image/webp');
        res.send(processedImage);

    } catch (error) {
        console.error('Error processing image:', error);
        res.status(500).json({ error: 'Error processing image' });
    }
});

app.listen(port, () => {
    console.log(`Image optimization service running on port ${port} with Bun 🚀`);
}); 