import { isAuthError } from "@toolgrain/mcp";
import { resourceMetadataUrl } from "./resource.js";

export function authResponse(resource: string, failure?: unknown): Response {
  const code =
    failure === undefined
      ? undefined
      : isAuthError(failure)
        ? failure.code
        : "temporarily_unavailable";
  const status =
    code === "invalid_request"
      ? 400
      : code === "access_denied"
        ? 403
        : code === "temporarily_unavailable"
          ? 503
          : 401;
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (status === 401 || status === 400) {
    headers.set(
      "WWW-Authenticate",
      `Bearer resource_metadata=${JSON.stringify(resourceMetadataUrl(resource))}${code ? `, error=${JSON.stringify(code)}` : ""}`,
    );
  }
  return Response.json({ error: code ?? "unauthorized" }, { status, headers });
}
