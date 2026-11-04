import type { ProgressToken, RequestId } from "@toolgrain/protocol";

/** Owns duplicate detection and cancellation signals for in-flight requests. */
export function createPendingRequests(isOpen: () => boolean) {
  const pending = new Map<RequestId, AbortController>();
  const progressTokens = new Set<ProgressToken>();
  return {
    begin(id: RequestId) {
      if (pending.has(id)) return;
      const controller = new AbortController();
      pending.set(id, controller);
      let releaseProgress: (() => void) | undefined;
      return {
        signal: controller.signal,
        isActive: () => isOpen() && !controller.signal.aborted,
        claimProgress(token: ProgressToken) {
          if (progressTokens.has(token)) return false;
          progressTokens.add(token);
          releaseProgress = () => {
            progressTokens.delete(token);
            controller.signal.removeEventListener("abort", release);
            releaseProgress = undefined;
          };
          // Aborting releases the token even if the cancelled handler keeps running.
          const release = () => releaseProgress?.();
          controller.signal.addEventListener("abort", release, { once: true });
          return true;
        },
        finish: () => {
          releaseProgress?.();
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
