const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

function authority(value: string, protocol: string): string {
  if (!value || /[\s,/?#@\\%*]/.test(value) || value.endsWith(":"))
    throw new TypeError(
      "allowedHosts must contain exact hosts with optional ports",
    );
  return new URL(`${protocol}//${value}`).host;
}

/** Validate the URL authority before routing, discovery, or authorization. */
export function hostValidator(allowedHosts?: readonly string[]) {
  const http = new Set(allowedHosts?.map((host) => authority(host, "http:")));
  const https = new Set(allowedHosts?.map((host) => authority(host, "https:")));
  const allows = (url: URL): boolean =>
    (url.protocol === "http:" || url.protocol === "https:") &&
    !url.username &&
    !url.password &&
    (allowedHosts === undefined
      ? loopback.has(url.hostname)
      : (url.protocol === "https:" ? https : http).has(url.host));
  return (request: Request): Request | Response => {
    const url = new URL(request.url);
    if (!allows(url)) return new Response(null, { status: 403 });
    const host = request.headers.get("Host");
    if (host !== null) {
      try {
        const target = new URL(
          `${url.protocol}//${authority(host, url.protocol)}`,
        );
        if (!allows(target)) return new Response(null, { status: 403 });
        if (target.host !== url.host) {
          // Frameworks may normalize local URL hosts; preserve the validated authority.
          url.host = target.host;
          return new Request(url, request);
        }
      } catch {
        return new Response(null, { status: 403 });
      }
    }
    return request;
  };
}
