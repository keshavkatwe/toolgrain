import type { RequestTransport, Transport } from "./transport.js";

const key = Symbol.for("@toolgrain/mcp/claimed-transports/v1");

/** Claim once before startup. Share weak ownership across compatible package copies. */
export function claimTransport(transport: Transport | RequestTransport): void {
  let claimed = Object.getOwnPropertyDescriptor(globalThis, key)?.value as
    | WeakSet<object>
    | undefined;
  if (!claimed) {
    claimed = new WeakSet<object>();
    Object.defineProperty(globalThis, key, { value: claimed });
  }
  if (claimed.has(transport))
    throw new Error("Transport is already attached to a server");
  claimed.add(transport);
}
