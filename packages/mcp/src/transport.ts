import type { ProtocolResponse } from "@toolgrain/protocol";
import type { Server } from "./server.js";

/** Callbacks are synchronous; message processing runs independently. */
export interface TransportCallbacks {
  onMessage(message: unknown): void;
  onParseError(error: unknown): void;
  onError(error: unknown): void;
  onClose(): void;
}

/** Adapters own UTF-8 framing, JSON decoding, and stream cleanup. */
export interface Transport {
  readonly mode?: "message";
  start(callbacks: TransportCallbacks): Promise<void>;
  send(message: ProtocolResponse): Promise<void>;
  close(): Promise<void>;
}

/** Request transports own listeners and use the server's per-request authorization bridge. */
export interface RequestTransport {
  readonly mode: "request";
  start(
    server: Server,
    callbacks: Pick<TransportCallbacks, "onError" | "onClose">,
  ): Promise<void>;
  close(): Promise<void>;
}

export function isRequestTransport(
  transport: Transport | RequestTransport,
): transport is RequestTransport {
  return "mode" in transport && transport.mode === "request";
}
