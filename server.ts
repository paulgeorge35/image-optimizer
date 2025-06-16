import { handleImageRequest } from "./lib";

Bun.serve({
  port: 3000,
  routes: {
    "/:src": handleImageRequest,
    "/favicon.ico": () => new Response(null, { status: 204 }),
  },
  fetch(_req) {
    return new Response("Not Found", { status: 404 });
  },
});
