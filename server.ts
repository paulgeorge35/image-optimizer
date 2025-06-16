import pino from "pino";
import { handleImageRequest } from "./lib";

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

const port = Bun.env.PORT ? Number(Bun.env.PORT) : 3000;
const hostname = "0.0.0.0"; // Bind to all interfaces

logger.info(`⚙️  Starting server on ${hostname}:${port}`);

Bun.serve({
  port,
  hostname,
  routes: {
    "/": () => new Response("Image Optimizer is running", { status: 200 }),
    "/:src": handleImageRequest,
    "/favicon.ico": () => new Response(null, { status: 204 }),
  },
  fetch(_req) {
    return new Response("Not Found", { status: 404 });
  },
  error(error) {
    logger.error({ err: error }, "❌ Server error occurred");
    return new Response("Internal Server Error", { status: 500 });
  },
});

logger.info("🚀 Server started successfully");
