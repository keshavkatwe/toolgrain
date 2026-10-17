import { PROTOCOL_VERSION } from "@toolgrain/protocol";
import type { HttpProtocol } from "../http-protocol.js";
import { validateRequest } from "./headers.js";
import { errorId, responseStatus } from "./responses.js";

export const modernHttp: HttpProtocol = {
  protocolVersion: PROTOCOL_VERSION,
  validateRequest,
  acceptsNotification: () => false,
  errorId,
  responseStatus,
};
