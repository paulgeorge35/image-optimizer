import { getServiceStatus, handleImageRequest, logger } from "./lib";

logger.info(`🚀 Server is running on port ${Bun.env.PORT ?? 3000}`);

Bun.serve({
  port: Bun.env.PORT ?? 3000,
  routes: {
    "/:src": handleImageRequest,
    "/favicon.ico": () => new Response(null, { status: 204 }),
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
  fetch(_req) {
    return new Response("Not Found", { status: 404 });
  },
});
