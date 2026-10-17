import type {
  ProtocolResponse,
  RequestId,
  SupportedProtocolVersion,
} from "@toolgrain/protocol";
import type { ObjectValue } from "./object.js";
import type { ParameterHeaders } from "./parameter-headers.js";

export interface HeaderFailure {
  code: number;
  message: string;
  data?: unknown;
}

export interface ErrorId {
  id?: RequestId | null;
}

/** The concrete HTTP policies that differ between the two supported eras. */
export interface HttpProtocol {
  protocolVersion: SupportedProtocolVersion;
  validateRequest(
    headers: Headers,
    body: ObjectValue,
    parameters: ParameterHeaders,
  ): HeaderFailure | undefined;
  acceptsNotification(body: ObjectValue): boolean;
  errorId(body?: ObjectValue): ErrorId;
  responseStatus(response: ProtocolResponse): number;
}
