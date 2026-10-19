import type { RequestId } from "@toolgrain/protocol";

/** Owns duplicate detection and cancellation signals for in-flight requests. */
export function createPendingRequests(isOpen: () => boolean) {
  const pending = new Map<RequestId, AbortController>();
  return {
    begin(id: RequestId) {
      if (pending.has(id)) return;
      const controller = new AbortController();
      pending.set(id, controller);
      return {
        signal: controller.signal,
        isActive: () => isOpen() && !controller.signal.aborted,
        finish: () => {
          pending.delete(id);
        },
      };
    },
    cancel(id: RequestId) {
      pending
        .get(id)
        ?.abort(new DOMException("Request cancelled by client", "AbortError"));
    },
    clear() {
      for (const controller of pending.values())
        controller.abort(new DOMException("Connection closed", "AbortError"));
      pending.clear();
    },
  };
}
