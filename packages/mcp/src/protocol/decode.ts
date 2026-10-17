import {
  INVALID_REQUEST,
  type JSONRPCErrorResponse,
  type RequestId,
} from "@toolgrain/protocol";
import {
  cancellation,
  envelope,
  type Notification,
  type Request,
  requestId,
} from "./messages.js";
import { protocolError } from "./responses.js";

type Incoming =
  | { kind: "request"; request: Request }
  | { kind: "cancel"; id: RequestId }
  | { kind: "notification"; notification: Notification }
  | { kind: "ignore" }
  | {
      kind: "error";
      response: JSONRPCErrorResponse;
    };

/** Decode the envelope; method parameters are validated by the dispatcher. */
export function decode(message: unknown): Incoming {
  const parsed = envelope.safeParse(message);
  if (!parsed.success) {
    if (
      typeof message === "object" &&
      message !== null &&
      !Array.isArray(message) &&
      "method" in message &&
      !Object.hasOwn(message, "id")
    )
      return { kind: "ignore" };
    const id =
      typeof message === "object" && message !== null && "id" in message
        ? requestId.safeParse(message.id)
        : undefined;
    return {
      kind: "error",
      response: protocolError(
        INVALID_REQUEST,
        "Invalid request",
        id?.success ? id.data : undefined,
      ),
    };
  }
  if (parsed.data.id !== undefined)
    return { kind: "request", request: { ...parsed.data, id: parsed.data.id } };
  if (parsed.data.method === "notifications/cancelled") {
    const params = cancellation.safeParse(parsed.data.params);
    if (params.success) return { kind: "cancel", id: params.data.requestId };
    return { kind: "ignore" };
  }
  return { kind: "notification", notification: parsed.data };
}
