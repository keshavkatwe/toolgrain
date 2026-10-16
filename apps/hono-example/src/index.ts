import { serve } from "@hono/node-server";
import { honoApp } from "./app.js";

const { app, server } = honoApp();
const http = serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 3002),
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close();
    http.close();
    if ("closeAllConnections" in http) http.closeAllConnections();
  });
