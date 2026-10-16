import { elysiaApp } from "./app.js";

const { app } = elysiaApp();
app.listen({ hostname: "127.0.0.1", port: Number(process.env.PORT ?? 3003) });
