import {
  AuthError,
  type AuthMetadata,
  type AuthScope,
  type Server,
} from "@toolgrain/mcp";
import { requestResource } from "./resource.js";
import { authResponse } from "./responses.js";

export async function authorizeRequest(
  server: Server,
  request: Request,
  metadata: AuthMetadata,
): Promise<AuthScope | Response> {
  let resource: string;
  try {
    resource = requestResource(request, metadata);
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const header = request.headers.get("Authorization");
  try {
    if (new URL(request.url).searchParams.has("access_token"))
      throw new AuthError("invalid_request");
    if (!header || !/^Bearer(?:\s|$)/i.test(header))
      return authResponse(resource);
    const token = /^Bearer +([A-Za-z0-9._~+/-]+=*)$/i.exec(header)?.[1];
    if (!token) throw new AuthError("invalid_request");
    return await server.authorize(token, { resource, signal: request.signal });
  } catch (error) {
    request.signal.throwIfAborted();
    return authResponse(resource, error);
  }
}
