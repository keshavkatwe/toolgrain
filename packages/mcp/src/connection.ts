import {
  INVALID_REQUEST,
  PARSE_ERROR,
  type ProtocolResponse,
} from "@toolgrain/protocol";
import type { Dispatcher } from "./dispatcher.js";
import { executeRequest } from "./execute-request.js";
import { createLegacyConnection } from "./legacy/connection.js";
import { createPendingRequests } from "./pending-requests.js";
import { decode } from "./protocol/decode.js";
import type { Request } from "./protocol/messages.js";
import { protocolError } from "./protocol/responses.js";
import type { Server } from "./server.js";
import type {
  RequestTransport,
  Transport,
  TransportCallbacks,
} from "./transport.js";
import { claimTransport } from "./transport-ownership.js";

export function createConnection(
  dispatch: Dispatcher,
  onError?: (error: unknown) => void,
  onClose?: () => void,
): ConnectionLifecycle {
  return new Connection(dispatch, onError, onClose);
}

interface ConnectionLifecycle {
  listen(transport: Transport): Promise<void>;
  listenRequests(transport: RequestTransport, server: Server): Promise<void>;
  close(): Promise<void>;
}

/** Owns transport attachment, serialized writes, and connection shutdown. */
class Connection implements ConnectionLifecycle {
  private state: "idle" | "starting" | "listening" | "closed" = "idle";
  private transport: Transport | RequestTransport | undefined;
  private closePromise: Promise<void> | undefined;
  private writes = Promise.resolve();
  private readonly requests = createPendingRequests(() => this.isOpen());
  private readonly legacy = createLegacyConnection();

  constructor(
    private readonly dispatch: Dispatcher,
    private readonly onError?: (error: unknown) => void,
    private readonly onClose?: () => void,
  ) {}

  // Public methods remain safe to call detached from the returned server.
  readonly listen = (transport: Transport): Promise<void> =>
    this.attach(transport, () => transport.start(this.transportCallbacks));

  readonly listenRequests = (
    transport: RequestTransport,
    server: Server,
  ): Promise<void> =>
    this.attach(transport, () =>
      transport.start(server, {
        onError: this.transportCallbacks.onError,
        onClose: this.transportCallbacks.onClose,
      }),
    );

  private readonly attach = async (
    transport: Transport | RequestTransport,
    start: () => Promise<void>,
  ): Promise<void> => {
    if (this.state !== "idle")
      throw new Error(
        "Server can only attach one transport and cannot restart after closing",
      );
    claimTransport(transport);
    this.state = "starting";
    this.transport = transport;
    try {
      await start();
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
    this.closePromise = Promise.resolve().then(async () => {
      const transport = this.transport;
      this.transport = undefined;
      await transport?.close();
    });
    // Aborting runs handler listeners synchronously; a nested close reuses this promise.
    this.onClose?.();
    this.requests.clear();
    return this.closePromise;
  };

  private readonly transportCallbacks: TransportCallbacks = {
    onMessage: (message) => {
      void this.receive(message).catch((error) => this.terminate(error));
    },
    onParseError: () => {
      if (this.isOpen())
        void this.send(
          this.legacy.errorResponse(protocolError(PARSE_ERROR, "Parse error")),
        );
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
    message: ProtocolResponse,
    isActive: () => boolean = () => this.isOpen(),
  ): Promise<void> {
    const write = this.writes.then(async () => {
      if (
        this.isOpen() &&
        isActive() &&
        this.transport &&
        "send" in this.transport
      )
        await this.transport.send(message);
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
        if (this.legacy.canCancel(incoming.id))
          this.requests.cancel(incoming.id);
        return;
      case "notification":
        this.legacy.notification(incoming.notification);
        return;
      case "error":
        await this.send(this.legacy.errorResponse(incoming.response));
        return;
      case "request":
        await this.handleRequest(incoming.request);
    }
  }

  private async handleRequest(request: Request): Promise<void> {
    const prepared = this.legacy.prepare(request);
    if (prepared.error) {
      await this.send(prepared.error);
      return;
    }
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
    const initialization = this.legacy.begin(request, prepared.protocolVersion);
    try {
      const response = await executeRequest(
        this.dispatch,
        request,
        { signal: pending.signal, client: this.legacy.client() },
        (error) => this.report(error),
        prepared.protocolVersion,
      );
      initialization?.respond(response);
      if (response) await this.send(response, pending.isActive);
    } finally {
      initialization?.finish();
      pending.finish();
    }
  }
}
