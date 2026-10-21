import { AuthError, validateAuthUrl } from "@toolgrain/mcp";

/** Fetch only trusted configuration URLs, without following redirects or unbounded bodies. */
export async function fetchJson(
  url: string,
  signal: AbortSignal,
  limit = 65536,
): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    redirect: "manual",
    headers: { Accept: "application/json" },
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new MetadataHttpError(response.status);
  }
  if (!response.body) throw new AuthError("temporarily_unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new AuthError("temporarily_unavailable");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

class MetadataHttpError extends Error {
  constructor(readonly status: number) {
    super("Could not retrieve authorization metadata");
  }
}

export async function discoverJwks(issuer: string): Promise<string> {
  const base = new URL(issuer);
  const path = base.pathname === "/" ? "" : base.pathname;
  const candidates = [
    `${base.origin}/.well-known/oauth-authorization-server${path}`,
    `${base.origin}/.well-known/openid-configuration${path}`,
    ...(path
      ? [
          `${base.origin}${path.replace(/\/$/, "")}/.well-known/openid-configuration`,
        ]
      : []),
  ];
  for (const candidate of candidates) {
    let value: unknown;
    try {
      value = await fetchJson(candidate, AbortSignal.timeout(5000));
    } catch (error) {
      if (
        error instanceof MetadataHttpError &&
        [404, 405].includes(error.status)
      )
        continue;
      throw error;
    }
    if (
      !value ||
      typeof value !== "object" ||
      !("issuer" in value) ||
      value.issuer !== issuer ||
      !("jwks_uri" in value) ||
      typeof value.jwks_uri !== "string"
    )
      throw new AuthError("temporarily_unavailable");
    return validateAuthUrl(value.jwks_uri);
  }
  throw new AuthError("temporarily_unavailable");
}
