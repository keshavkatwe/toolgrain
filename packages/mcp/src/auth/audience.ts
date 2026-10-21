import { AuthError } from "./errors.js";

/** Validate the audience of an already verified token without disclosing its claims. */
export function validateTokenAudience(
  audience: unknown,
  resource: string,
): void {
  if (audience === undefined)
    throw new AuthError("invalid_token", {
      description: `Access token is missing the aud claim. Configure the authorization server to include an audience and request a new token with resource=${resource}.`,
    });
  const audiences = typeof audience === "string" ? [audience] : audience;
  if (
    !Array.isArray(audiences) ||
    audiences.some((value) => typeof value !== "string")
  )
    throw new AuthError("invalid_token");
  if (!audiences.includes(resource))
    throw new AuthError("invalid_token", {
      description: `Access token aud claim does not match the expected resource ${resource}. Request a new token with this resource.`,
    });
}
