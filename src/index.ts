import cors from 'cors';
import type { Request, Response } from 'express';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from 'redis';
import sharp from 'sharp';

const app = express();
const port = process.env.PORT || 3000;
const IMAGES_DIR = path.join(process.cwd(), 'images');

// Enable CORS for all routes
app.use(
  cors({
    origin: '*', // Allow all origins
    methods: ['GET'], // Only allow GET requests
    allowedHeaders: ['Content-Type'], // Allow Content-Type header
    maxAge: 86400, // Cache preflight requests for 24 hours
  })
);

// Log the images directory path on startup
console.info('Images directory:', IMAGES_DIR);

let redis: ReturnType<typeof createClient> | null = null;
let isCacheEnabled = false;

// Initialize Redis if URL is provided
async function initializeCache() {
  try {
    if (process.env.REDIS_URL) {
      redis = createClient({
        url: process.env.REDIS_URL,
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

async function getImageBuffer(src: string): Promise<Buffer> {
  // Check if src starts with http:// or https:// for URLs
  if (src.startsWith('http://') || src.startsWith('https://')) {
    try {
      const imageResponse = await fetch(src);
      if (!imageResponse.ok) {
        throw new Error('Image not found');
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    } catch (error) {
      console.error('Error fetching URL:', error);
      throw new Error(`Failed to fetch image from URL: ${src}`);
    }
  } else {
    // Handle local file
    const normalizedPath = path.normalize(src).replace(/^(\.\.(\/|\\|$))+/, '');
    const localPath = path.join(IMAGES_DIR, normalizedPath);

    console.log('Current working directory:', process.cwd());
    console.log('Images directory:', IMAGES_DIR);
    console.log('Looking for local image:', localPath);

    try {
      const exists = await fs
        .access(localPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        console.error('File not found:', localPath);
        // List contents of images directory
        try {
          const files = await fs.readdir(IMAGES_DIR);
          console.log('Available images:', files);
        } catch (e) {
          console.error('Error reading images directory:', e);
        }
        throw new Error(`Image not found: ${src}`);
      }

      return await fs.readFile(localPath);
    } catch (fileError) {
      console.error('Error reading local file:', fileError);
      throw new Error(`Failed to read image: ${src}`);
    }
  }
}

app.get('/:src', async (req: Request, res: Response) => {
  try {
    const src = decodeURIComponent(req.params.src);
    const width = req.query.w as string | undefined;
    const quality = (req.query.q as string) || '75';

    if (!src) {
      res.status(400).json({ error: 'Source image is required' });
      return;
    }

    // Try cache if Redis is available
    if (isCacheEnabled && redis) {
      const cacheKey = `img:${src}:w=${width}:q=${quality}`;
      const cachedImage = await redis.get(cacheKey);

      if (cachedImage) {
        console.log('Cache hit:', cacheKey);
        res.set('Content-Type', 'image/webp');
        res.set('X-Cache', 'HIT');
        res.send(Buffer.from(cachedImage, 'base64'));
      }
    }

    // Get image buffer from URL or local file
    const originalBuffer = await getImageBuffer(src);
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
    const savings = (((originalSize - optimizedSize) / originalSize) * 100).toFixed(2);

    console.log(`Image: ${src}`);
    console.log(`Original size: ${(originalSize / 1024).toFixed(2)} KB`);
    console.log(`Optimized size: ${(optimizedSize / 1024).toFixed(2)} KB`);
    console.log(`Saved: ${savings}%`);

    // Cache the optimized image if Redis is available
    if (isCacheEnabled && redis) {
      const cacheKey = `img:${src}:w=${width}:q=${quality}`;
      await redis.set(cacheKey, processedImage.toString('base64'), {
        EX: 60 * 60 * 24 * 7, // Cache for 7 days
      });
      res.set('X-Cache', 'MISS');
    }

    // If optimization resulted in a larger file, return original
    if (parseFloat(savings) < 0) {
      res.set('Content-Type', 'image/webp');
      res.send(originalBuffer);
    } else {
      // Send the optimized image
      res.set('Content-Type', 'image/webp');
      res.send(processedImage);
    }
  } catch (error) {
    console.error('Error processing image:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Error processing image 1' });
  }
});

// Always start a standard HTTP/1.1 server, Nginx will handle HTTPS/HTTP2

app.listen(port, () => {
  // Log slightly differently based on NODE_ENV for clarity, but always use HTTP/1.1 internally
  if (process.env.NODE_ENV === 'production') {
    console.log(
      `🚀 Image optimization service running (proxied via Nginx) on internal port ${port} using HTTP/2`
    );
  } else {
    console.log(
      `🚀 Image optimization service running (development) on port ${port} using HTTP/1.1`
    );
  }
});
