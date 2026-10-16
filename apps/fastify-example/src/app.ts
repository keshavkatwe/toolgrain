import { createHttpHandler } from "@toolgrain/http";
import type { FastifyPluginAsync } from "fastify";
import { exampleServer } from "./server.ts";

const appPlugin: FastifyPluginAsync = async (app, _options) => {
  const server = exampleServer();
  const handler = createHttpHandler(server);
  // Encapsulate raw parsing to this route, leaving application parsers unchanged.
  await app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      "*",
      { parseAs: "buffer", bodyLimit: 1024 * 1024 },
      (_request, body, done) => done(null, body),
    );
    scope.all("/mcp", async (request, reply) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value))
          for (const item of value) headers.append(name, item);
        else if (value !== undefined) headers.set(name, value);
      }
      const controller = new AbortController();
      const disconnected = () => {
        if (!reply.raw.writableFinished) controller.abort();
      };
      reply.raw.once("close", disconnected);
      try {
        const response = await handler(
          new Request("http://localhost/mcp", {
            method: request.method,
            headers,
            signal: controller.signal,
            ...(request.method === "GET" || request.method === "HEAD"
              ? {}
              : { body: new Uint8Array(request.body as Buffer) }),
          }),
        );
        return reply.send(response);
      } finally {
        reply.raw.off("close", disconnected);
      }
    });
  });
  app.addHook("onClose", () => server.close());
};
export default appPlugin;
