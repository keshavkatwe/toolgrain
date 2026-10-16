import {
  INVALID_REQUEST,
  type JSONRPCResponse,
  PARSE_ERROR,
} from "@toolgrain/protocol";
import type { Dispatcher } from "./dispatcher.js";
import { executeRequest } from "./execute-request.js";
import { createPendingRequests } from "./pending-requests.js";
import { decode } from "./protocol/decode.js";
import type { Request } from "./protocol/messages.js";
import { protocolError } from "./protocol/responses.js";
import type { Server } from "./server.js";
import type { Transport, TransportCallbacks } from "./transport.js";

export function createConnection(
  dispatch: Dispatcher,
  onError?: (error: unknown) => void,
  onClose?: () => void,
): Pick<Server, "listen" | "close"> {
  return new Connection(dispatch, onError, onClose);
}

/** Owns transport attachment, serialized writes, and connection shutdown. */
class Connection implements Pick<Server, "listen" | "close"> {
  private state: "idle" | "starting" | "listening" | "closed" = "idle";
  private transport: Transport | undefined;
  private closePromise: Promise<void> | undefined;
  private writes = Promise.resolve();
  private readonly requests = createPendingRequests(() => this.isOpen());

  constructor(
    private readonly dispatch: Dispatcher,
    private readonly onError?: (error: unknown) => void,
    private readonly onClose?: () => void,
  ) {}

  // Public methods remain safe to call detached from the returned server.
  readonly listen = async (transport: Transport): Promise<void> => {
    if (this.state !== "idle")
      throw new Error(
        "Server can only attach one transport and cannot restart after closing",
      );
    this.state = "starting";
    this.transport = transport;
    try {
      await transport.start(this.transportCallbacks);
      if (!this.isOpen()) throw new Error("Transport closed during startup");
      this.state = "listening";
    } catch (error) {
      await this.terminate(error);
      throw error;
    }
  };

  readonly close = (): Promise<void> => {
    if (this.closePromise) return this.closePromise;
    this.state = "closed";
    this.onClose?.();
    this.requests.clear();
    this.closePromise = Promise.resolve().then(async () => {
      const transport = this.transport;
      this.transport = undefined;
      await transport?.close();
    });
    return this.closePromise;
  };

  private readonly transportCallbacks: TransportCallbacks = {
    onMessage: (message) => {
      void this.receive(message).catch((error) => this.terminate(error));
    },
    onParseError: () => {
      if (this.isOpen())
        void this.send(protocolError(PARSE_ERROR, "Parse error"));
    },
    onError: (error) => {
      void this.terminate(error);
    },
    onClose: () => {
      void this.close().catch((error) => this.report(error));
    },
  };

  private isOpen(): boolean {
    return this.state === "starting" || this.state === "listening";
  }

  private report(error: unknown): void {
    try {
      this.onError?.(error);
    } catch {
      /* Diagnostics must not break cleanup. */
    }
  }

  private async terminate(error: unknown): Promise<void> {
    this.report(error);
    try {
      await this.close();
    } catch (failure) {
      this.report(failure);
    }
  }

  private send(
    message: JSONRPCResponse,
    isActive: () => boolean = () => this.isOpen(),
  ): Promise<void> {
    const write = this.writes.then(async () => {
      if (this.isOpen() && isActive()) await this.transport?.send(message);
    });
    this.writes = write.catch((error) => this.terminate(error));
    return this.writes;
  }

  private async receive(message: unknown): Promise<void> {
    if (!this.isOpen()) return;
    const incoming = decode(message);
    switch (incoming.kind) {
      case "ignore":
        return;
      case "cancel":
        this.requests.cancel(incoming.id);
        return;
      case "error":
        await this.send(incoming.response);
        return;
      case "request":
        await this.handleRequest(incoming.request);
    }
  }

  private async handleRequest(request: Request): Promise<void> {
    const pending = this.requests.begin(request.id);
    if (!pending) {
      await this.send(
        protocolError(
          INVALID_REQUEST,
          "Request ID is already in use",
          request.id,
        ),
      );
      return;
    }
    try {
      const response = await executeRequest(
        this.dispatch,
        request,
        pending.isActive,
        (error) => this.report(error),
      );
      if (response) await this.send(response, pending.isActive);
    } finally {
      pending.finish();
    }
  }
}
