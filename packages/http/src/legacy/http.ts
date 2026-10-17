import { LEGACY_PROTOCOL_VERSION } from "@toolgrain/protocol";
import type { HttpProtocol } from "../http-protocol.js";
import { validateRequest } from "./headers.js";
import { acceptsNotification } from "./notifications.js";
import { errorId, responseStatus } from "./responses.js";

export const legacyHttp: HttpProtocol = {
  protocolVersion: LEGACY_PROTOCOL_VERSION,
  validateRequest,
  acceptsNotification,
  errorId,
  responseStatus,
};
