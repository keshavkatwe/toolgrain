import {
  INVALID_REQUEST,
  type JSONRPCErrorResponse,
  LEGACY_PROTOCOL_VERSION,
  type ProtocolResponse,
  type RequestId,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import type {
  ClientCapabilities,
  Implementation,
} from "@toolgrain/protocol/2025-06-18";
import type { Notification, Request } from "../protocol/messages.js";
import { protocolError } from "../protocol/responses.js";
import {
  hasProtocolVersionMetadata,
  metadataMatchesVersion,
} from "../protocol/version-metadata.js";
import { type ToolClient, toolClient } from "../tools/context.js";
import { commonParams, initializeParams } from "./messages.js";
import { errorResponse } from "./responses.js";

/** Owns the initialization lifecycle for one attached transport. */
export function createLegacyConnection() {
  let state: "initializing" | "awaiting-initialized" | "ready" | undefined;
  let initializeId: RequestId | undefined;
  let client: ToolClient | undefined;
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
          // The response succeeded only if these parameters already validated.
          const params = initializeParams.safeParse(request.params);
          if (state && params.success)
            client = toolClient(
              params.data.clientInfo as Implementation,
              params.data.capabilities as ClientCapabilities,
            );
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
    /** Details from a completed legacy initialization on this connection. */
    client() {
      return client;
    },
    canCancel(id: RequestId) {
      return id !== initializeId;
    },
    errorResponse(response: JSONRPCErrorResponse) {
      return state === undefined ? response : errorResponse(response);
    },
  };
}
