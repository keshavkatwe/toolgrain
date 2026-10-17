import {
  INVALID_REQUEST,
  type JSONRPCErrorResponse,
  LEGACY_PROTOCOL_VERSION,
  type ProtocolResponse,
  type RequestId,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import type { Notification, Request } from "../protocol/messages.js";
import { protocolError } from "../protocol/responses.js";
import {
  hasProtocolVersionMetadata,
  metadataMatchesVersion,
} from "../protocol/version-metadata.js";
import { commonParams } from "./messages.js";
import { errorResponse } from "./responses.js";

/** Owns the initialization lifecycle for one attached transport. */
export function createLegacyConnection() {
  let state: "initializing" | "awaiting-initialized" | "ready" | undefined;
  let initializeId: RequestId | undefined;
  return {
    prepare(request: Request) {
      const legacy =
        (state !== undefined &&
          metadataMatchesVersion(request, LEGACY_PROTOCOL_VERSION)) ||
        (!hasProtocolVersionMetadata(request) &&
          (state !== undefined ||
            request.method === "initialize" ||
            request.method === "ping"));
      if (!legacy) return {};
      const initialize = request.method === "initialize";
      if (
        initialize
          ? state !== undefined
          : state !== "ready" && request.method !== "ping"
      )
        return {
          error: protocolError(
            INVALID_REQUEST,
            initialize
              ? "Server is already initialized"
              : "Server is not initialized",
            request.id,
          ),
        };
      return { protocolVersion: LEGACY_PROTOCOL_VERSION } as const;
    },
    begin(request: Request, protocolVersion?: SupportedProtocolVersion) {
      if (
        protocolVersion !== LEGACY_PROTOCOL_VERSION ||
        request.method !== "initialize"
      )
        return;
      state = "initializing";
      initializeId = request.id;
      return {
        respond(response: ProtocolResponse | undefined) {
          state =
            response && "result" in response
              ? "awaiting-initialized"
              : undefined;
        },
        finish() {
          initializeId = undefined;
        },
      };
    },
    notification(notification: Notification) {
      if (
        notification.method === "notifications/initialized" &&
        commonParams.safeParse(notification.params ?? {}).success &&
        state === "awaiting-initialized"
      )
        state = "ready";
    },
    canCancel(id: RequestId) {
      return id !== initializeId;
    },
    errorResponse(response: JSONRPCErrorResponse) {
      return state === undefined ? response : errorResponse(response);
    },
  };
}
