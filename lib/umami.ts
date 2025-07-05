import { logger } from "./index";

interface UmamiConfig {
  baseUrl: string;
  websiteId: string;
  username?: string;
  password?: string;
  token?: string;
}

interface UmamiEvent {
  name: string;
  data?: Record<string, any>;
  url?: string;
  title?: string;
}

interface UmamiAuthResponse {
  token: string;
  user: {
    id: string;
    username: string;
    createdAt: string;
  };
}

interface UmamiVerifyResponse {
  id: string;
  username: string;
  role: string;
  isAdmin: boolean;
}

interface ImageOptimizationEvent {
  originalUrl: string;
  width?: number;
  quality?: number;
  originalSize?: number;
  optimizedSize?: number;
  processingTime?: number;
  success: boolean;
  error?: string;
  cacheHit?: boolean;
  source: "url" | "r2";
  referrer?: string;
  userAgent?: string;
  eventType: "optimization" | "cache_hit" | "cache_miss" | "error";
}

export class UmamiService {
  private config: UmamiConfig;
  private token: string | null = null;
  private isAuthenticated = false;

  constructor(config: UmamiConfig) {
    this.config = config;
  }

  /**
   * Authenticates with the Umami API using username/password
   */
  async authenticate(): Promise<boolean> {
    if (this.config.token) {
      this.token = this.config.token;
      this.isAuthenticated = true;
      return true;
    }

    if (!this.config.username || !this.config.password) {
      logger.warn("Umami: No credentials provided for authentication");
      return false;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: this.config.username,
          password: this.config.password,
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status}`);
      }

      const data = (await response.json()) as UmamiAuthResponse;
      this.token = data.token;
      this.isAuthenticated = true;

      logger.info("✅ Umami authentication successful");
      return true;
    } catch (error) {
      logger.error("❌ Umami authentication failed:", error);
      return false;
    }
  }

  /**
   * Verifies if the current token is still valid
   */
  async verifyToken(): Promise<boolean> {
    if (!this.token) {
      return false;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/api/auth/verify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        this.isAuthenticated = false;
        this.token = null;
        return false;
      }

      const data = (await response.json()) as UmamiVerifyResponse;
      this.isAuthenticated = true;
      return true;
    } catch (error) {
      logger.error("❌ Umami token verification failed:", error);
      this.isAuthenticated = false;
      this.token = null;
      return false;
    }
  }

  /**
   * Sends an event to Umami
   */
  async trackEvent(event: UmamiEvent, userAgent?: string): Promise<boolean> {
    if (!this.isAuthenticated) {
      logger.warn("Umami: Not authenticated, skipping event tracking");
      return false;
    }

    try {
      const payload = {
        payload: {
          hostname: "image-optimizer",
          language: "en-US",
          referrer: event.data?.referrer || "https://image.paulgeorge.dev",
          screen: "1920x1080",
          title: event.title || "Image Optimization",
          url: event.url || "/",
          website: this.config.websiteId,
          name: event.name,
          data: event.data || {},
        },
        type: "event",
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      // Use the original User-Agent if provided, otherwise fall back to default
      headers["User-Agent"] = userAgent || "Image-Optimizer-Service/1.0.0";

      const response = await fetch(`${this.config.baseUrl}/api/send`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to send event: ${response.status}`);
      }

      // Check if response indicates bot/spam detection
      const responseText = await response.text();
      try {
        const responseData = JSON.parse(responseText);
        if (responseData.beep === "boop") {
          logger.error("❌ Umami tagged request as bot/spam", {
            event: event.name,
            userAgent: userAgent || "default",
            responseData,
          });
          return false;
        }
      } catch (parseError) {
        // Response is not JSON, which is fine
      }

      return true;
    } catch (error) {
      logger.error("❌ Failed to track Umami event:", error);
      return false;
    }
  }

  /**
   * Tracks image optimization requests
   */
  async trackImageOptimization(event: ImageOptimizationEvent): Promise<boolean> {
    const eventData = {
      name: "image_optimization",
      data: {
        eventType: event.eventType,
        originalUrl: event.originalUrl,
        width: event.width,
        quality: event.quality,
        originalSize: event.originalSize,
        optimizedSize: event.optimizedSize,
        processingTime: event.processingTime,
        success: event.success,
        error: event.error,
        cacheHit: event.cacheHit,
        source: event.source,
        referrer: event.referrer,
        userAgent: event.userAgent,
        compressionRatio:
          event.originalSize && event.optimizedSize
            ? Math.round((1 - event.optimizedSize / event.originalSize) * 100)
            : null,
      },
      url: "/optimize",
      title: "Image Optimization",
    };

    return this.trackEvent(eventData, event.userAgent);
  }

  /**
   * Tracks cache hits
   */
  async trackCacheHit(
    originalUrl: string,
    source: "url" | "r2",
    referrer?: string,
    userAgent?: string
  ): Promise<boolean> {
    return this.trackImageOptimization({
      originalUrl,
      source,
      referrer,
      userAgent,
      success: true,
      cacheHit: true,
      eventType: "cache_hit",
    });
  }

  /**
   * Tracks cache misses
   */
  async trackCacheMiss(
    originalUrl: string,
    source: "url" | "r2",
    referrer?: string,
    userAgent?: string
  ): Promise<boolean> {
    return this.trackImageOptimization({
      originalUrl,
      source,
      referrer,
      userAgent,
      success: true,
      cacheHit: false,
      eventType: "cache_miss",
    });
  }

  /**
   * Tracks errors
   */
  async trackError(error: string, context?: Record<string, any>): Promise<boolean> {
    return this.trackImageOptimization({
      originalUrl: context?.originalUrl || "",
      source: context?.source || "url",
      referrer: context?.referrer,
      userAgent: context?.userAgent,
      success: false,
      error,
      eventType: "error",
    });
  }

  /**
   * Tracks service health checks
   */
  async trackHealthCheck(
    status: "healthy" | "unhealthy",
    details?: Record<string, any>
  ): Promise<boolean> {
    return this.trackEvent({
      name: "health_check",
      data: {
        status,
        details,
        timestamp: new Date().toISOString(),
      },
      url: "/health",
      title: "Health Check",
    });
  }

  /**
   * Gets the authentication status
   */
  getAuthStatus(): { isAuthenticated: boolean; hasToken: boolean } {
    return {
      isAuthenticated: this.isAuthenticated,
      hasToken: !!this.token,
    };
  }
}

/**
 * Creates and initializes a Umami service instance
 */
export async function createUmamiService(config: UmamiConfig): Promise<UmamiService> {
  const service = new UmamiService(config);

  // Try to authenticate if credentials are provided
  if (config.username && config.password) {
    await service.authenticate();
  } else if (config.token) {
    await service.verifyToken();
  }

  return service;
}

/**
 * Default Umami configuration from environment variables
 */
export function getDefaultUmamiConfig(): UmamiConfig | null {
  const baseUrl = Bun.env.UMAMI_HOSTNAME;
  const websiteId = Bun.env.UMAMI_WEBSITE_ID;

  if (!baseUrl || !websiteId) {
    return null;
  }

  return {
    baseUrl,
    websiteId,
    username: Bun.env.UMAMI_USER,
    password: Bun.env.UMAMI_PASSWORD,
    token: Bun.env.UMAMI_TOKEN,
  };
}
