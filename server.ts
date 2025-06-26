import { getServiceStatus, handleImageRequest, logger } from "./lib";

logger.info(`🚀 Server is running on port ${Bun.env.PORT ?? 3000}`);

Bun.serve({
  port: Bun.env.PORT ?? 3000,
  routes: {
    "/:src": handleImageRequest,
    "/favicon.ico": () => new Response(null, { status: 204 }),
    "/robots.txt": () =>
      new Response(
        `User-agent: *
Disallow: /`,
        {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }
      ),
    "/health": () =>
      new Response(
        JSON.stringify({
          status: "healthy",
          ...getServiceStatus(),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      ),
  },
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Handle common web requests
    switch (path) {
      case "/":
        return new Response(
          JSON.stringify({
            service: "Image Optimizer",
            version: "1.0.0",
            description: "High-performance image optimization service",
            endpoints: {
              image: "/{image-url}?w={width}&q={quality}",
              health: "/health",
              robots: "/robots.txt",
            },
            example: "/https%3A//example.com/image.jpg?w=800&q=80",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );

      case "/sitemap.xml":
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${url.origin}/</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`,
          {
            status: 200,
            headers: { "Content-Type": "application/xml" },
          }
        );

      default:
        // Check if it's a common web request that should return 404
        if (path.startsWith("/.") || path.includes(".")) {
          return new Response("Not Found", { status: 404 });
        }

        // For other requests, try to handle as image request
        return handleImageRequest(req);
    }
  },
});
