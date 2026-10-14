import type { JSONRPCResponse } from "./vendor/schema.js";

/** Callbacks are synchronous; message processing runs independently. */
export interface TransportCallbacks {
  onMessage(message: unknown): void;
  onParseError(error: unknown): void;
  onError(error: unknown): void;
  onClose(): void;
}

/** Adapters own UTF-8 framing, JSON decoding, and stream cleanup. */
export interface Transport {
  start(callbacks: TransportCallbacks): Promise<void>;
  send(message: JSONRPCResponse): Promise<void>;
  close(): Promise<void>;
}
