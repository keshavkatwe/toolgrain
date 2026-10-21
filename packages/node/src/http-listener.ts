import {
  createServer as createHttpServer,
  type Server as NodeServer,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { HttpOptions } from "@toolgrain/http";
import type { RequestTransport } from "@toolgrain/mcp";
import { createNodeHttpHandler } from "./http.js";

export interface HttpTransportOptions extends HttpOptions {
  /** Defaults to 3000. Use 0 to let the operating system choose a port. */
  port?: number;
  /** Bind address; defaults to 127.0.0.1. This is separate from allowedHosts. */
  hostname?: string;
}

export interface HttpTransport extends RequestTransport {
  /** A copied bound address, or undefined before startup and after closing. */
  address(): AddressInfo | undefined;
}

/** Own a Node HTTP listener with combined MCP routing and local host defaults. */
export function http(options: HttpTransportOptions = {}): HttpTransport {
  const port = options.port ?? 3000;
  const hostname = options.hostname ?? "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new RangeError("port must be an integer between 0 and 65535");
  if (!hostname || /[\s/?#@\\]/.test(hostname))
    throw new TypeError("hostname must be a bind hostname or IP address");
  const config = {
    ...options,
    ...(options.allowedHosts === undefined
      ? {}
      : { allowedHosts: [...options.allowedHosts] }),
    ...(options.allowedOrigins === undefined
      ? {}
      : { allowedOrigins: [...options.allowedOrigins] }),
  };
  let listener: NodeServer | undefined;
  let started = false;
  let closed = false;
  let closePromise: Promise<void> | undefined;
  const binding = new AbortController();
  let onClose: (() => void) | undefined;
  const notifyClose = () => {
    const notify = onClose;
    onClose = undefined;
    notify?.();
  };
  return {
    mode: "request",
    address() {
      const address = listener?.address();
      return address && typeof address !== "string"
        ? { ...address }
        : undefined;
    },
    async start(server, callbacks) {
      if (started || closed) throw new Error("HTTP transport cannot restart");
      started = true;
      const node = createHttpServer();
      listener = node;
      onClose = callbacks.onClose;
      node.once("close", notifyClose);
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          node.off("error", failed);
          node.off("close", stopped);
          node.off("listening", ready);
        };
        const failed = (error: Error) => {
          cleanup();
          reject(error);
        };
        const stopped = () =>
          failed(new Error("HTTP transport closed during startup"));
        const ready = () => {
          cleanup();
          resolve();
        };
        node.once("error", failed);
        node.once("close", stopped);
        node.once("listening", ready);
        node.listen({ host: hostname, port, signal: binding.signal });
      });
      const address = node.address() as AddressInfo;
      const localHosts = ["localhost", "127.0.0.1", "[::1]"].map(
        (host) => `${host}:${address.port}`,
      );
      const handle = createNodeHttpHandler(server, {
        ...config,
        allowedHosts: config.allowedHosts ?? localHosts,
      });
      node.on("error", callbacks.onError);
      node.on("request", (request, response) => {
        void handle(request, response);
      });
    },
    close() {
      if (closePromise) return closePromise;
      closed = true;
      closePromise = Promise.resolve().then(
        () =>
          new Promise<void>((resolve) => {
            if (!listener) {
              resolve();
              return;
            }
            listener.close(() => resolve());
            binding.abort();
            listener.closeAllConnections();
          }),
      );
      notifyClose();
      return closePromise;
    },
  };
}
