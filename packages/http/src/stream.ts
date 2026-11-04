import type { AuthScope, Server } from "@toolgrain/mcp";
import type {
  ProgressNotification,
  ProtocolResponse,
} from "@toolgrain/protocol";
import type { HttpProtocol } from "./http-protocol.js";
import type { ObjectValue } from "./object.js";
import { protocolResponse, unavailableResponse } from "./responses.js";

// Internal MCP contract: retain request cancellation through final delivery.
const responseDelivery = Symbol.for("@toolgrain/mcp/response-delivery/v1");

/** Open SSE on the first progress message; otherwise preserve the ordinary JSON response. */
export function executeStreamingRequest(
  server: Server,
  message: ObjectValue,
  clientSignal: AbortSignal,
  protocol: HttpProtocol,
  auth?: AuthScope,
): Promise<Response> {
  const cancellation = new AbortController();
  const signal = AbortSignal.any([
    clientSignal,
    cancellation.signal,
    ...(auth ? [auth.signal] : []),
  ]);
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  let resolve!: (response: Response) => void;
  let reject!: (error: unknown) => void;
  const ready = new Promise<Response>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const encoder = new TextEncoder();
  const encode = (value: ProgressNotification | ProtocolResponse) =>
    encoder.encode(`event: message\ndata: ${JSON.stringify(value)}\n\n`);
  const abort = () => {
    void writer?.abort(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const notify = async (value: ProgressNotification) => {
    if (signal.aborted) return;
    if (!writer) {
      const stream = new TransformStream<Uint8Array, Uint8Array>();
      writer = stream.writable.getWriter();
      void writer.closed.catch(() => {
        cancellation.abort(
          new DOMException("HTTP response stream closed", "AbortError"),
        );
      });
      resolve(
        new Response(stream.readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
          },
        }),
      );
    }
    await writer.write(encode(value));
  };
  let delivered = false;
  const deliver = async (response: ProtocolResponse) => {
    if (!writer) return;
    await writer.write(encode(response));
    // Release auth before EOF, while MCP still tracks the delivery itself.
    auth?.dispose();
    await writer.close();
    delivered = true;
  };
  const execute = async () => {
    try {
      const options = {
        signal,
        protocolVersion: protocol.protocolVersion,
        onNotification: notify,
        [responseDelivery]: deliver,
        ...(auth ? { auth } : {}),
      };
      const response = await server.handle(message, options);
      signal.throwIfAborted();
      if (writer) {
        if (!response) {
          await writer.abort(
            new DOMException("Request cancelled", "AbortError"),
          );
          return;
        }
        // Structural Server implementations may not implement the internal hook.
        if (!delivered) await deliver(response);
      } else {
        resolve(
          response
            ? protocolResponse(response, protocol)
            : unavailableResponse(message, protocol),
        );
      }
    } catch (error) {
      if (writer) {
        await writer
          .abort(new DOMException("HTTP response stream closed", "AbortError"))
          .catch(() => {});
      } else if (signal.aborted) reject(error);
      else resolve(unavailableResponse(message, protocol));
    } finally {
      signal.removeEventListener("abort", abort);
      writer?.releaseLock();
      auth?.dispose();
    }
  };
  void execute();
  return ready;
}
