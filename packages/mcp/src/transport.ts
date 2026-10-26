import type { ProtocolResponse } from "@toolgrain/protocol";
import type { Server } from "./server.js";

/** Callbacks are synchronous; message processing runs independently. */
export interface TransportCallbacks {
  /** Deliver one JSON-decoded message without waiting for asynchronous protocol processing. */
  onMessage(message: unknown): void;
  /** Report invalid JSON or framing so the server can send a protocol parse error. */
  onParseError(error: unknown): void;
  /** Report a fatal transport failure; the server records it and closes the connection. */
  onError(error: unknown): void;
  /** Notify the server of end-of-input or transport closure so active work can be aborted. */
  onClose(): void;
}

/** Single-use adapters own UTF-8 framing, JSON decoding, and stream cleanup. */
export interface Transport {
  /** Message-transport discriminator; may be omitted for custom message adapters. */
  readonly mode?: "message";
  /**
   * Start delivery once and resolve when ready. Call `Server.listen()` to establish ownership.
   * @param callbacks - Synchronous message and lifecycle notifications supplied by the server.
   */
  start(callbacks: TransportCallbacks): Promise<void>;
  /**
   * Send one protocol response, resolving after the adapter's write/backpressure handling.
   * @param message - Response envelope already converted for the client's protocol revision.
   */
  send(message: ProtocolResponse): Promise<void>;
  /** Release adapter-owned resources; closing is terminal and must tolerate repeated calls. */
  close(): Promise<void>;
}

/** Single-use request transports own listeners and use per-request authorization. */
export interface RequestTransport {
  /** Identifies an independent-request transport, required by auth-configured servers. */
  readonly mode: "request";
  /**
   * Start the owned listener once and resolve when ready; invoked through `Server.listen()`.
   * @param server - Server used for per-request authorization and protocol dispatch.
   * @param callbacks - Fatal-error and closure notifications supplied by the server.
   */
  start(
    server: Server,
    callbacks: Pick<TransportCallbacks, "onError" | "onClose">,
  ): Promise<void>;
  /** Stop the owned listener and active connections; closing is terminal and idempotent. */
  close(): Promise<void>;
}

export function isRequestTransport(
  transport: Transport | RequestTransport,
): transport is RequestTransport {
  return "mode" in transport && transport.mode === "request";
}
