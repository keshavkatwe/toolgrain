import { expressApp } from "./app.js";

const { app, server } = expressApp();
const http = app.listen(Number(process.env.PORT ?? 3001), "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close();
    http.close();
    http.closeAllConnections();
  });
