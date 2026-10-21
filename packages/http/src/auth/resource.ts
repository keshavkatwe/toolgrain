import { type AuthMetadata, validateAuthUrl } from "@toolgrain/mcp";

export const metadataPrefix = "/.well-known/oauth-protected-resource";

/** The hosting layer must supply a public URL after host and proxy validation. */
export function requestResource(
  request: Request,
  metadata: AuthMetadata,
  isMetadata = false,
): string {
  if (metadata.resource) return metadata.resource;
  const url = new URL(request.url);
  if (isMetadata)
    url.pathname = url.pathname.slice(metadataPrefix.length) || "/";
  url.search = "";
  url.hash = "";
  const resource = url.origin + (url.pathname === "/" ? "" : url.pathname);
  return validateAuthUrl(resource);
}

export function resourceMetadataUrl(resource: string): string {
  const url = new URL(resource);
  url.pathname = metadataPrefix + (url.pathname === "/" ? "" : url.pathname);
  return url.href;
}
