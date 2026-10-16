import type { Server } from "@toolgrain/mcp";
import { createNodeHttpHandler } from "@toolgrain/node";
import express, { type Express } from "express";
import { exampleServer } from "./server.js";
export function expressApp(): { app: Express; server: Server } {
  const app = express();
  const server = exampleServer();
  app.all("/mcp", createNodeHttpHandler(server));
  app.use(express.json());
  return { app, server };
}
