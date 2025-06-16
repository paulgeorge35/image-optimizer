import { join } from "node:path";
import pino from "pino";
import sharp from "sharp";

// Configure Pino logger
const logger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
});

const IMAGES_DIR = join(process.cwd(), "images");

let redis: Bun.RedisClient | null = null;
let isCacheEnabled = false;

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
    if (Bun.env.REDIS_URL) {
      redis = new Bun.RedisClient(Bun.env.REDIS_URL);
      isCacheEnabled = true;
      logger.info("✅ Redis cache enabled");
    } else {
      logger.info("ℹ️ Redis cache disabled (REDIS_URL not set)");
    }
  } catch (error) {
    logger.error({ err: error }, "❌ Redis connection failed");
    redis = null;
    isCacheEnabled = false;
  }
}

await initializeCache();

/**
 * Retrieves an image buffer from either a URL or local file system.
 *
 * @param {string} src - The source of the image. Can be a URL (http/https) or local file path.
 * @returns {Promise<Buffer>} A promise that resolves to the image buffer.
 * @throws {Error} If the image cannot be fetched or found.
 *
 * @example
 * // Fetch from URL
 * const buffer = await getImageBuffer('https://example.com/image.jpg');
 *
 * @example
 * // Fetch from local file
 * const buffer = await getImageBuffer('images/photo.jpg');
 */
export async function getImageBuffer(src: string): Promise<Buffer> {
  // Check if src starts with http:// or https:// for URLs
  if (src.startsWith("http://") || src.startsWith("https://")) {
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
    // Handle local file
    const normalizedPath = src.replace(/^(\.\.(\/|\\|$))+/, "");
    const localPath = join(IMAGES_DIR, normalizedPath);

    logger.info(
      { cwd: process.cwd(), imagesDir: IMAGES_DIR, localPath },
      "🔍 Looking for local image"
    );

    try {
      const file = Bun.file(localPath);
      const exists = await file.exists();

      if (!exists) {
        logger.warn({ localPath }, "File not found");
        // List contents of images directory
        try {
          const files = await Bun.$`ls ${IMAGES_DIR}`.text();
          logger.info({ files }, "Available images");
        } catch (e) {
          logger.error({ err: e }, "Error reading images directory");
        }
        throw new Error(`Image not found: ${src}`);
      }

      return Buffer.from(await file.arrayBuffer());
    } catch (fileError) {
      logger.error({ err: fileError }, "Error reading local file");
      throw new Error(`Failed to read image: ${src}`);
    }
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
  try {
    const url = new URL(req.url);
    const src = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const width = url.searchParams.get("w");
    const quality = url.searchParams.get("q") || "75";

    logger.info({ src, width, quality }, "📥 Processing image request");

    if (!src) {
      logger.warn("❌ No source image provided");
      return new Response(JSON.stringify({ error: "Source image is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Try cache if Redis is available
    if (isCacheEnabled && redis) {
      const cacheKey = `img:${src}:w=${width}:q=${quality}`;
      try {
        const cachedImage = await redis.get(cacheKey);
        if (cachedImage) {
          logger.info({ cacheKey }, "✅ Cache hit");
          return new Response(new Uint8Array(Buffer.from(cachedImage, "base64")), {
            headers: {
              "Content-Type": "image/webp",
              "X-Cache": "HIT",
            },
          });
        }
        logger.info({ cacheKey }, "❌ Cache miss");
      } catch (cacheError) {
        logger.error({ err: cacheError }, "❌ Cache error");
      }
    }

    // Get image buffer from URL or local file
    logger.info({ src }, "🔍 Fetching image");
    const originalBuffer = await getImageBuffer(src);
    const originalSize = originalBuffer.length;

    // Process the image with sharp
    logger.info("🔄 Processing image with Sharp");
    let imageProcess = sharp(originalBuffer);

    // Resize if width is provided
    if (width) {
      const parsedWidth = parseInt(width, 10);
      if (!isNaN(parsedWidth)) {
        logger.info({ width: parsedWidth }, "📏 Resizing image");
        imageProcess = imageProcess.resize(parsedWidth);
      }
    }

    // Set quality and convert to WebP
    const q = parseInt(quality, 10);
    if (!isNaN(q) && q >= 0 && q <= 100) {
      logger.info({ quality: q }, "🎨 Setting quality");
      imageProcess = imageProcess.webp({ quality: q });
    }

    // Get the processed buffer
    logger.info("💾 Converting to buffer");
    const processedImage = await imageProcess.toBuffer();
    const optimizedSize = processedImage.length;
    const savings = (((originalSize - optimizedSize) / originalSize) * 100).toFixed(2);

    logger.info({ src }, `🖼️  Image processed`);
    logger.info({ originalSize: (originalSize / 1024).toFixed(2) + " KB" }, `💾 Original size`);
    logger.info({ optimizedSize: (optimizedSize / 1024).toFixed(2) + " KB" }, `💾 Optimized size`);
    if (parseFloat(savings) > 0) {
      logger.info({ savings: `${savings}%` }, `💰 Saved`);
    }

    // Cache the optimized image if Redis is available
    if (isCacheEnabled && redis) {
      const cacheKey = `img:${src}:w=${width}:q=${quality}`;
      try {
        logger.info({ cacheKey }, "💾 Caching image");
        await redis.set(cacheKey, processedImage.toString("base64"), "EX", 60 * 60 * 24 * 7); // Cache for 7 days
      } catch (cacheError) {
        logger.error({ err: cacheError }, "❌ Failed to cache image");
      }
    }

    // If optimization resulted in a larger file, return original
    if (parseFloat(savings) < 0) {
      logger.info("⚠️ Optimization resulted in larger file, returning original");
      return new Response(new Uint8Array(originalBuffer), {
        headers: {
          "Content-Type": "image/webp",
          "X-Cache": "MISS",
        },
      });
    } else {
      // Send the optimized image
      logger.info("✅ Sending optimized image");
      return new Response(new Uint8Array(processedImage), {
        headers: {
          "Content-Type": "image/webp",
          "X-Cache": "MISS",
        },
      });
    }
  } catch (error) {
    logger.error(
      { err: error, stack: error instanceof Error ? error.stack : undefined },
      "❌ Error processing image"
    );
    if (error instanceof Error && error.message.includes("not found")) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error processing image",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
