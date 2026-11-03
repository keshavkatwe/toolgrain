import type {
  ProgressNotification,
  ProtocolResponse,
} from "@toolgrain/protocol";
import type { Transport, TransportCallbacks } from "../src/index.js";

export class MemoryTransport implements Transport {
  callbacks: TransportCallbacks | undefined;
  messages: ProtocolResponse[] = [];
  notifications: ProgressNotification[] = [];
  closes = 0;
  async start(callbacks: TransportCallbacks) {
    this.callbacks = callbacks;
  }
  async send(message: ProtocolResponse | ProgressNotification) {
    if ("method" in message) this.notifications.push(message);
    else this.messages.push(message);
  }
  async close() {
    this.closes++;
    this.callbacks = undefined;
  }
  receive(message: unknown) {
    this.callbacks?.onMessage(message);
  }
}
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
