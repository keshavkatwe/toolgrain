import { expect, it } from "vitest";
import {
  AuthError,
  createServer,
  isAuthError,
  validateAuthScopes,
} from "../src/index.js";

const provider = {
  type: Symbol.for("test/scope-metadata"),
  authorizationServers: ["https://auth.example.com"],
  async verify() {
    return {};
  },
};

it("copies scope metadata at construction and on every read", async () => {
  const scopesSupported = ["openid", "tools:Read", "tools:read"];
  const auth = { ...provider, scopesSupported };
  const server = createServer({
    name: "scopes",
    version: "1",
    tools: {},
    auth,
  });
  try {
    scopesSupported.push("private_metadata");
    auth.scopesSupported = ["changed"];
    const metadata = server.getAuthMetadata();
    expect(metadata?.scopesSupported).toEqual([
      "openid",
      "tools:Read",
      "tools:read",
    ]);
    if (!metadata?.scopesSupported) throw new Error("Expected scope metadata");
    (metadata.scopesSupported as string[]).push("changed");
    expect(server.getAuthMetadata()?.scopesSupported).toEqual([
      "openid",
      "tools:Read",
      "tools:read",
    ]);
  } finally {
    await server.close();
  }
});

it.each([
  null,
  "profile",
  [""],
  ["two scopes"],
  ["tab\tscope"],
  ["line\r\nbreak"],
  ["profile\n"],
  ["profile\r"],
  ['quoted"scope'],
  ["back\\slash"],
  ["ü"],
  ["\x7f"],
  [7],
  ["profile", "profile"],
  new Array(1),
])(
  "rejects invalid scope configuration without echoing values: %j",
  (scopes) => {
    expect(() => validateAuthScopes(scopes as readonly string[])).toThrow(
      TypeError,
    );
    expect(() =>
      createServer({
        name: "bad-scopes",
        version: "1",
        tools: {},
        auth: { ...provider, scopesSupported: scopes as readonly string[] },
      }),
    ).toThrow("OAuth scopes");
    expect(
      () =>
        new AuthError("insufficient_scope", {
          requiredScopes: scopes as readonly string[],
        }),
    ).toThrow("OAuth scopes");
  },
);

it("accepts RFC scope-token punctuation and explicitly empty scope catalogs", () => {
  const scopes = ["!", "#$%&'()*+,-./:;<=>?@[]^_`{|}~", "A", "a", "0"];
  expect(validateAuthScopes(scopes)).toEqual(scopes);
  expect(Object.isFrozen(validateAuthScopes(scopes))).toBe(true);
  expect(validateAuthScopes([])).toEqual([]);
});

it("keeps required scopes frozen, public, and separate from private causes across copies", async () => {
  const { AuthError: CopyError } = await import("../src/auth/errors.js");
  const requiredScopes = ["tools:read"];
  const cause = new Error("private provider detail");
  const error = new CopyError("insufficient_scope", { requiredScopes, cause });
  requiredScopes.push("changed");
  expect(isAuthError(error)).toBe(true);
  expect(error.requiredScopes).toEqual(["tools:read"]);
  expect(Object.isFrozen(error.requiredScopes)).toBe(true);
  expect(error.cause).toBe(cause);
  expect(error.description).toBeUndefined();
  expect(error.message).toBe("Access token has insufficient scope");
  expect(() => new AuthError("invalid_token", { requiredScopes: [] })).toThrow(
    "only to insufficient_scope",
  );
});
