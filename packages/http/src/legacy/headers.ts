import { HEADER_MISMATCH } from "@toolgrain/protocol";
import { validateRoutingHeaders } from "../headers.js";
import type { HeaderFailure } from "../http-protocol.js";
import { type ObjectValue, object } from "../object.js";
import type { ParameterHeaders } from "../parameter-headers.js";

export function isInitializationProposal(body: ObjectValue): boolean {
  const meta = object(object(body.params)?._meta);
  return (
    body.method === "initialize" &&
    (!meta || !Object.hasOwn(meta, "io.modelcontextprotocol/protocolVersion"))
  );
}

export function validateRequest(
  headers: Headers,
  body: ObjectValue,
  parameters: ParameterHeaders,
): HeaderFailure | undefined {
  try {
    const meta = object(object(body.params)?._meta);
    if (
      meta &&
      Object.hasOwn(meta, "io.modelcontextprotocol/protocolVersion") &&
      meta["io.modelcontextprotocol/protocolVersion"] !==
        headers.get("MCP-Protocol-Version")
    )
      throw new Error("Mismatched protocol version metadata");
    validateRoutingHeaders(headers, body, parameters, false);
  } catch (failure) {
    return { code: HEADER_MISMATCH, message: (failure as Error).message };
  }
}
