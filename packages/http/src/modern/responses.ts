import {
  INVALID_PARAMS,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  MISSING_REQUIRED_CLIENT_CAPABILITY,
  type ProtocolResponse,
  UNSUPPORTED_PROTOCOL_VERSION,
} from "@toolgrain/protocol";
import type { ObjectValue } from "../object.js";
import { responseId } from "../responses.js";

export function errorId(body?: ObjectValue) {
  const id = responseId(body);
  return id === undefined ? {} : { id };
}

export function responseStatus(response: ProtocolResponse): number {
  if (!("error" in response)) return 200;
  const code = response.error.code;
  const badRequest = [
    UNSUPPORTED_PROTOCOL_VERSION,
    MISSING_REQUIRED_CLIENT_CAPABILITY,
    INVALID_REQUEST,
    INVALID_PARAMS,
  ].includes(code);
  return code === METHOD_NOT_FOUND ? 404 : badRequest ? 400 : 200;
}
