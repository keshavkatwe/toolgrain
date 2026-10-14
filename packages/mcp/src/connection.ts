import type { createDispatcher } from "./dispatcher.js";
import { createPendingRequests } from "./pending-requests.js";
import { decode } from "./protocol/decode.js";
import { ProtocolError, protocolError } from "./protocol/responses.js";
import type { Transport } from "./transport.js";
import {
  INTERNAL_ERROR,
  INVALID_REQUEST,
  type JSONRPCResponse,
  PARSE_ERROR,
} from "./vendor/schema.js";

/** Owns transport attachment, serialized writes, and connection shutdown. */
export function createConnection(
  dispatch: ReturnType<typeof createDispatcher>,
  onError?: (error: unknown) => void,
) {
  let state: "idle" | "starting" | "listening" | "closed" = "idle";
  let transport: Transport | undefined;
  let closePromise: Promise<void> | undefined;
  let writes = Promise.resolve();
  const isOpen = () => state === "starting" || state === "listening";
  const requests = createPendingRequests(isOpen);

  function report(error: unknown) {
    try {
      onError?.(error);
    } catch {
      /* Diagnostics must not break cleanup. */
    }
  }
  function close(): Promise<void> {
    if (closePromise) return closePromise;
    state = "closed";
    requests.clear();
    closePromise = Promise.resolve().then(async () => {
      const attached = transport;
      transport = undefined;
      await attached?.close();
    });
    return closePromise;
  }
  async function terminate(error: unknown) {
    report(error);
    try {
      await close();
    } catch (failure) {
      report(failure);
    }
  }
  function send(message: JSONRPCResponse, isActive = isOpen): Promise<void> {
    const write = writes.then(async () => {
      if (isOpen() && isActive()) await transport?.send(message);
    });
    writes = write.catch(terminate);
    return writes;
  }
  async function receive(message: unknown) {
    if (!isOpen()) return;
    const incoming = decode(message);
    if (incoming.kind === "ignore") return;
    if (incoming.kind === "cancel") {
      requests.cancel(incoming.id);
      return;
    }
    if (incoming.kind === "error") {
      await send(incoming.response);
      return;
    }

    const request = incoming.request;
    const pending = requests.begin(request.id);
    if (!pending) {
      await send(
        protocolError(
          INVALID_REQUEST,
          "Request ID is already in use",
          request.id,
        ),
      );
      return;
    }
    try {
      const response = await dispatch(request, pending.isActive);
      if (response) await send(response, pending.isActive);
    } catch (error) {
      if (error instanceof ProtocolError) {
        await send(
          protocolError(error.code, error.message, request.id, error.data),
          pending.isActive,
        );
      } else {
        report(error);
        await send(
          protocolError(INTERNAL_ERROR, "Internal error", request.id),
          pending.isActive,
        );
      }
    } finally {
      pending.finish();
    }
  }
  return {
    async listen(attached: Transport) {
      if (state !== "idle")
        throw new Error(
          "Server can only attach one transport and cannot restart after closing",
        );
      state = "starting";
      transport = attached;
      try {
        await attached.start({
          onMessage(message) {
            void receive(message).catch(terminate);
          },
          onParseError() {
            if (isOpen()) void send(protocolError(PARSE_ERROR, "Parse error"));
          },
          onError(error) {
            void terminate(error);
          },
          onClose() {
            void close().catch(report);
          },
        });
        if (!isOpen()) throw new Error("Transport closed during startup");
        state = "listening";
      } catch (error) {
        await terminate(error);
        throw error;
      }
    },
    close,
  };
}
