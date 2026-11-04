/** Implemented by integrations; the HTTP adapter supplies the resolved resource. */
export interface AuthProvider<Identity extends object = object> {
  /** Stable provider identity used by `createAuthAccessor()`; use `Symbol.for()` across copies. */
  readonly type: symbol;
  /** Canonical public MCP resource URL; omission lets the HTTP adapter infer it per request. */
  readonly resource?: string;
  /** Nonempty list of trusted authorization-server URLs advertised in public metadata. */
  readonly authorizationServers: readonly string[];
  /** Optional resource scope catalog for discovery, copied at server creation; not a required-scope policy. */
  readonly scopesSupported?: readonly string[];
  /**
   * Verify token authenticity, validity, and resource audience before returning plain identity data.
   * The server copies and deeply freezes the identity before exposing it to handlers.
   *
   * @param accessToken - Raw bearer token without its scheme prefix.
   * @param options - Resolved resource and request cancellation signal.
   * @returns Verified plain data; credentials and SDK methods should not be included.
   * @throws `AuthError` for expected rejections; unexpected failures remain private diagnostics.
   */
  verify(accessToken: string, options: AuthVerifyOptions): Promise<Identity>;
}

/** Resource and cancellation information supplied to an authorization provider. */
export interface AuthVerifyOptions {
  /** Shared cancellation for verification, body reading, execution, and server shutdown. */
  readonly signal: AbortSignal;
  /** Expected token audience, after applying any provider resource override. */
  readonly resource: string;
}

/** Public authorization configuration copied by `Server.getAuthMetadata()`. */
export interface AuthMetadata {
  /** Canonical public resource URL, or absent when inferred from the current HTTP request. */
  readonly resource?: string;
  /** Trusted authorization-server URLs advertised by protected-resource metadata. */
  readonly authorizationServers: readonly string[];
  /** Resource scopes advertised as `scopes_supported`; absent means unspecified, empty means none. */
  readonly scopesSupported?: readonly string[];
}

/** An opaque, single-use authorization for one server invocation. Always dispose it. */
export interface AuthScope {
  /** Cancellation signal spanning verification and the authorized invocation. */
  readonly signal: AbortSignal;
  /** Release request bookkeeping and prevent future use; safe to call more than once. */
  dispose(): void;
}

/** Recursively readonly view of the plain identity snapshot exposed by auth accessors. */
export type AuthReadonly<T> = T extends readonly (infer Item)[]
  ? readonly AuthReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: AuthReadonly<T[Key]> }
    : T;

export interface AuthIdentity {
  readonly type: symbol;
  readonly value: object;
}
