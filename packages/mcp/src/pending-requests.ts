import type { RequestId } from "@toolgrain/protocol";

/** Owns duplicate detection and cancellation state for in-flight requests. */
export function createPendingRequests(isOpen: () => boolean) {
  const pending = new Map<RequestId, { cancelled: boolean }>();
  return {
    begin(id: RequestId) {
      if (pending.has(id)) return;
      const token = { cancelled: false };
      pending.set(id, token);
      return {
        isActive: () => isOpen() && !token.cancelled,
        finish: () => {
          pending.delete(id);
        },
      };
    },
    cancel(id: RequestId) {
      const token = pending.get(id);
      if (token) token.cancelled = true;
    },
    clear() {
      for (const token of pending.values()) token.cancelled = true;
      pending.clear();
    },
  };
}
