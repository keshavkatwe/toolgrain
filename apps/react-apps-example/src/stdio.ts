import { stdio } from "@toolgrain/node";
import { server } from "./server.js";

await server().listen(stdio());
