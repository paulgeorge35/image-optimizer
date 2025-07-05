import { mkdir } from "node:fs/promises";
import { join } from "path";
import pino from "pino";
import sharp from "sharp";
import { createUmamiService, getDefaultUmamiConfig, UmamiService } from "./umami";

// Ensure logs directory exists
try {
  await mkdir("logs", { recursive: true });
} catch (error) {
  // Directory might already exist, ignore error
}

// Configure Pino logger with file transport
export const logger = pino({
  level: "info",
  transport: {
    targets: [
      {
        target: "pino-pretty",
        level: "info",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
      {
        target: "pino/file",
        level: "info",
        options: {
          destination: join("logs", "app.log"),
          mkdir: true,
        },
      },
    ],
  },
});

let redis: Bun.RedisClient | null = null;
let isCacheEnabled = false;
let s3Client: Bun.S3Client | null = null;
let umamiService: UmamiService | null = null;
const umamiConfig = getDefaultUmamiConfig();
if (umamiConfig) {
  createUmamiService(umamiConfig)
    .then((service: UmamiService) => {
      umamiService = service;
      logger.info("✅ Umami service initialized");
    })
    .catch((err: unknown) => {
      logger.error({ err }, "❌ Failed to initialize Umami service");
    });
} else {
  logger.warn("ℹ️ Umami config not set. Tracking is disabled.");
}

/**
 * Initializes the Redis cache connection if REDIS_URL is provided in environment variables.
 * Sets up the Redis client and enables caching if successful.
 *
 * @example
 * // Initialize cache with Redis URL in environment
 * await initializeCache();
 * // Console output: "✅ Redis cache enabled"
 */
export async function initializeCache() {
  try {
    redis = new Bun.RedisClient(Bun.env.REDIS_URL);
    redis.onconnect = () => {
      logger.info("✅ Redis cache connected");
    };
    redis.onclose = error => {
      logger.error({ err: error }, "❌ Redis cache disconnected");
    };

    await Promise.race([
      redis.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Redis connection timeout")), 1000)
      ),
    ]);

    isCacheEnabled = true;
    logger.info("✅ Redis cache enabled");
  } catch {
    logger.error({ REDIS_URL: Bun.env.REDIS_URL }, "❌ Redis connection failed");
    redis = null;
    isCacheEnabled = false;
  }
}

const credentials = {
  accessKeyId: Bun.env.R2_ACCESS_KEY_ID,
  secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY,
  bucket: Bun.env.R2_BUCKET_NAME,
};

/**
 * Initializes the S3 client for R2 bucket operations if R2 credentials are provided.
 * Sets up the S3 client for accessing Cloudflare R2 storage.
 *
 * @example
 * // Initialize S3 client with R2 credentials in environment
 * await initializeS3Client();
 * // Console output: "✅ S3 client enabled for R2"
 */
export async function initializeS3Client() {
  try {
    if (
      Bun.env.R2_ACCOUNT_ID &&
      Bun.env.R2_ACCESS_KEY_ID &&
      Bun.env.R2_SECRET_ACCESS_KEY &&
      Bun.env.R2_BUCKET_NAME &&
      Bun.env.R2_REGION
    ) {
      s3Client = new Bun.S3Client({
        region: Bun.env.R2_REGION,
        endpoint: `https://${Bun.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        accessKeyId: Bun.env.R2_ACCESS_KEY_ID,
        secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY,
      });
      await s3Client.list({ maxKeys: 1 }, credentials);
      logger.info("✅ S3 client enabled for R2");
    } else {
      logger.info("ℹ️ S3 client disabled (R2 credentials not set)");
    }
  } catch (error) {
    logger.error("❌ S3 client initialization failed");
    s3Client = null;
  }
}

/**
 * Gets the current status of Redis and S3 connections.
 *
 * @returns {Object} Status object containing Redis and S3 connection states.
 *
 * @example
 * const status = getServiceStatus();
 * // Returns: { redis: "connected", s3: "connected" }
 */
export function getServiceStatus() {
  return {
    redis: isCacheEnabled && redis ? "connected" : "disabled",
    s3: s3Client ? "connected" : "disabled",
    timestamp: new Date().toISOString(),
  };
}

await initializeCache();
await initializeS3Client();

/**
 * Retrieves an image buffer from either a URL or R2 bucket.
 *
 * @param {string} src - The source of the image. Can be a URL (http/https) or R2 bucket key.
 * @returns {Promise<Buffer>} A promise that resolves to the image buffer.
 * @throws {Error} If the image cannot be fetched or found.
 *
 * @example
 * // Fetch from URL
 * const buffer = await getImageBuffer('https://example.com/image.jpg');
 *
 * @example
 * // Fetch from R2 bucket
 * const buffer = await getImageBuffer('images/photo.jpg');
 */
export async function getImageBuffer(src: string): Promise<Buffer> {
  // Check if src starts with http:// or https:// for URLs
  if (src.startsWith("http://") || src.startsWith("https://")) {
    logger.info({ src }, "🔍 Looking for image in URL");
    try {
      const imageResponse = await fetch(src);
      if (!imageResponse.ok) {
        throw new Error("Image not found");
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    } catch (error) {
      logger.error({ err: error }, "Error fetching URL");
      throw new Error(`Failed to fetch image from URL: ${src}`);
    }
  } else {
    // Handle R2 bucket key
    try {
      // Try to get cached original image first
      const cachedOriginal = await getCachedOriginalImage(src);
      if (cachedOriginal) {
        logger.info({ src }, "✅ Original image retrieved from cache");
        return cachedOriginal;
      }

      if (!s3Client) {
        throw new Error("S3 client not initialized. Please set R2 credentials.");
      }
      logger.info({ src }, "🔍 Looking for image in R2 bucket");
      const response = s3Client.file(src, credentials);

      if (!response) {
        throw new Error("Empty response body from R2");
      }

      // Get the file content as buffer
      const buffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(buffer);
      logger.info({ key: src, size: buffer.byteLength }, "✅ Image retrieved from R2");

      // Cache the original image
      await cacheOriginalImage(src, imageBuffer);

      return imageBuffer;
    } catch (s3Error) {
      logger.error({ err: s3Error, key: src }, "Error reading from R2 bucket");

      // Check if it's a "not found" error
      if (s3Error instanceof Error && s3Error.message.includes("NoSuchKey")) {
        throw new Error(`Image not found in R2 bucket: ${src}`);
      }

      throw new Error(`Failed to read image from R2: ${src}`);
    }
  }
}

/**
 * Checks if an original image exists in the cache and returns it if found.
 *
 * @param {string} src - The source image path or URL.
 * @returns {Promise<Buffer|null>} The cached original image buffer or null if not found.
 */
async function getCachedOriginalImage(src: string): Promise<Buffer | null> {
  if (!isCacheEnabled || !redis) {
    return null;
  }

  const cacheKey = `original:${src}`;
  logger.info({ cacheKey }, "🔍 Getting original image from Redis");
  const cachedImage = await redis.get(cacheKey);

  if (cachedImage) {
    logger.info({ cacheKey }, "✅ Original image cache hit");
    return Buffer.from(cachedImage, "base64");
  }

  logger.info({ cacheKey }, "❌ Original image cache miss");
  return null;
}

/**
 * Caches an original image in Redis.
 *
 * @param {string} src - The source image path or URL.
 * @param {Buffer} imageBuffer - The original image buffer to cache.
 */
async function cacheOriginalImage(src: string, imageBuffer: Buffer): Promise<void> {
  if (!isCacheEnabled || !redis) {
    return;
  }

  const cacheKey = `original:${src}`;
  logger.info({ cacheKey }, "💾 Caching original image");
  await redis.set(cacheKey, imageBuffer.toString("base64"), "EX", 60 * 60 * 24 * 7); // Cache for 7 days
}

/**
 * Checks if an image exists in the cache and returns it if found.
 *
 * @param {string} src - The source image path or URL.
 * @param {string} width - The requested width.
 * @param {string} quality - The requested quality.
 * @returns {Promise<Buffer|null>} The cached image buffer or null if not found.
 */
async function getCachedImage(
  src: string,
  width: string | null,
  quality: string
): Promise<Buffer | null> {
  if (!isCacheEnabled || !redis) {
    return null;
  }

  logger.info("🔍 Trying cache");
  const cacheKey = `img:${src}:w=${width}:q=${quality}`;
  logger.info({ cacheKey }, "🔍 Getting from Redis");
  const cachedImage = await redis.get(cacheKey);

  if (cachedImage) {
    logger.info({ cacheKey }, "✅ Cache hit");
    return Buffer.from(cachedImage, "base64");
  }

  logger.info({ cacheKey }, "❌ Cache miss");
  return null;
}

/**
 * Caches an optimized image in Redis.
 *
 * @param {string} src - The source image path or URL.
 * @param {string} width - The requested width.
 * @param {string} quality - The requested quality.
 * @param {Buffer} imageBuffer - The image buffer to cache.
 */
async function cacheImage(
  src: string,
  width: string | null,
  quality: string,
  imageBuffer: Buffer
): Promise<void> {
  if (!isCacheEnabled || !redis) {
    return;
  }

  const cacheKey = `img:${src}:w=${width}:q=${quality}`;
  logger.info({ cacheKey }, "💾 Caching image");
  await redis.set(cacheKey, imageBuffer.toString("base64"), "EX", 60 * 60 * 24 * 7); // Cache for 7 days
}

/**
 * Processes an image using Sharp with the specified parameters.
 *
 * @param {Buffer} originalBuffer - The original image buffer.
 * @param {string} width - The requested width for resizing.
 * @param {string} quality - The requested quality (0-100).
 * @returns {Promise<Buffer>} The processed image buffer.
 */
async function processImage(
  originalBuffer: Buffer,
  width: string | null,
  quality: string
): Promise<Buffer> {
  let imageProcess = sharp(originalBuffer);

  // Resize if width is provided
  if (width) {
    const parsedWidth = parseInt(width, 10);
    if (!isNaN(parsedWidth)) {
      imageProcess = imageProcess.resize(parsedWidth);
    }
  }

  // Set quality and convert to WebP
  const q = parseInt(quality, 10);
  if (!isNaN(q) && q >= 0 && q <= 100) {
    imageProcess = imageProcess.webp({ quality: q });
  }

  return await imageProcess.toBuffer();
}

/**
 * Logs image optimization statistics.
 *
 * @param {string} src - The source image path or URL.
 * @param {number} originalSize - The original image size in bytes.
 * @param {number} optimizedSize - The optimized image size in bytes.
 */
function logOptimizationStats(src: string, originalSize: number, optimizedSize: number): void {
  const savings = (((originalSize - optimizedSize) / originalSize) * 100).toFixed(2);

  logger.info({ src }, `🖼️  Image processed`);
  logger.info({ originalSize: (originalSize / 1024).toFixed(2) + " KB" }, `💾 Original size`);
  logger.info({ optimizedSize: (optimizedSize / 1024).toFixed(2) + " KB" }, `💾 Optimized size`);
  if (parseFloat(savings) > 0) {
    logger.info({ savings: `${savings}%` }, `💰 Saved`);
  }
}

/**
 * Handles image optimization requests, including resizing, quality adjustment, and caching.
 * Processes images using Sharp and returns optimized WebP format.
 *
 * @param {Request} req - The incoming HTTP request containing image parameters.
 * @returns {Promise<Response>} A promise that resolves to the HTTP response with optimized image.
 *
 * Query Parameters:
 * - src: Source image path or URL (required)
 * - w: Width for resizing (optional)
 * - q: Quality (0-100, default: 75)
 *
 * @example
 * // Request URL: /photo.jpg?w=800&q=80
 * const response = await handleImageRequest(request);
 * // Returns optimized WebP image with width 800px and 80% quality
 */
export async function handleImageRequest(req: Request): Promise<Response> {
  const startTime = Date.now();
  let processingTime: number | undefined;
  let cacheHit = false;
  let source: "url" | "r2" = "url";
  let originalSize: number | undefined;
  let optimizedSize: number | undefined;
  let success = false;
  let error: string | undefined;
  let referrer: string | undefined;
  let userAgent: string | undefined;

  try {
    logger.info({ url: req.url }, "🔍 Handling image request");
    const url = new URL(req.url);
    const src = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const width = url.searchParams.get("w");
    const quality = url.searchParams.get("q") || "75";

    // Extract referrer and user agent from headers
    referrer = req.headers.get("referer") || req.headers.get("referrer") || undefined;
    userAgent = req.headers.get("user-agent") || undefined;

    if (!src) {
      error = "Source image is required";
      return new Response(JSON.stringify({ error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Determine source type
    source = src.startsWith("http://") || src.startsWith("https://") ? "url" : "r2";

    // Try to get cached image
    const cachedImage = await getCachedImage(src, width, quality);
    if (cachedImage) {
      cacheHit = true;
      processingTime = Date.now() - startTime;

      // Track cache hit
      if (umamiService) {
        await umamiService.trackCacheHit(src, source, referrer, userAgent);
      }

      return new Response(new Uint8Array(cachedImage), {
        headers: {
          "Content-Type": "image/webp",
          "X-Cache": "HIT",
        },
      });
    }

    // Track cache miss
    if (umamiService) {
      await umamiService.trackCacheMiss(src, source, referrer, userAgent);
    }

    // Get image buffer from URL or R2 bucket
    const originalBuffer = await getImageBuffer(src);
    originalSize = originalBuffer.length;

    // Process the image
    const processedImage = await processImage(originalBuffer, width, quality);
    optimizedSize = processedImage.length;

    // Log optimization statistics
    logOptimizationStats(src, originalSize, optimizedSize);

    // Cache the optimized image
    await cacheImage(src, width, quality, processedImage);

    // Calculate savings
    const savings = (((originalSize - optimizedSize) / originalSize) * 100).toFixed(2);

    processingTime = Date.now() - startTime;
    success = true;

    // If optimization resulted in a larger file, return original
    if (parseFloat(savings) < 0) {
      return new Response(new Uint8Array(originalBuffer), {
        headers: {
          "Content-Type": "image/webp",
          "X-Cache": "MISS",
        },
      });
    } else {
      // Send the optimized image
      return new Response(new Uint8Array(processedImage), {
        headers: {
          "Content-Type": "image/webp",
          "X-Cache": "MISS",
        },
      });
    }
  } catch (err) {
    processingTime = Date.now() - startTime;
    error = err instanceof Error ? err.message : "Unknown error";
    success = false;

    logger.error({ err }, "Error processing image");

    if (error.includes("not found")) {
      return new Response(JSON.stringify({ error }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    // Track the image optimization event
    if (umamiService) {
      const url = new URL(req.url);
      const src = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const width = url.searchParams.get("w");
      const quality = url.searchParams.get("q") || "75";

      await umamiService.trackImageOptimization({
        originalUrl: src,
        width: width ? parseInt(width, 10) : undefined,
        quality: parseInt(quality, 10),
        originalSize,
        optimizedSize,
        processingTime,
        success,
        error,
        cacheHit,
        source,
        referrer,
        userAgent,
        eventType: success ? (cacheHit ? "cache_hit" : "optimization") : "error",
      });
    }
  }
}
