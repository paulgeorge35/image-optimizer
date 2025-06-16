import { handleImageRequest } from "./lib";

const port = Bun.env.PORT ? Number(Bun.env.PORT) : 3000;

Bun.serve({
  port,
  routes: {
    "/:src": handleImageRequest,
    "/favicon.ico": () => new Response(null, { status: 204 }),
  },
  fetch(_req) {
    return new Response("Not Found", { status: 404 });
  },
});
