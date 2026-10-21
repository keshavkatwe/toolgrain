/** Implemented by integrations; the HTTP adapter supplies the resolved resource. */
export interface AuthProvider<Identity extends object = object> {
  readonly type: symbol;
  readonly resource?: string;
  readonly authorizationServers: readonly string[];
  verify(accessToken: string, options: AuthVerifyOptions): Promise<Identity>;
}

export interface AuthVerifyOptions {
  readonly signal: AbortSignal;
  readonly resource: string;
}

export interface AuthMetadata {
  readonly resource?: string;
  readonly authorizationServers: readonly string[];
}

/** An opaque, single-use authorization for one server invocation. Always dispose it. */
export interface AuthScope {
  readonly signal: AbortSignal;
  dispose(): void;
}

export type AuthReadonly<T> = T extends readonly (infer Item)[]
  ? readonly AuthReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: AuthReadonly<T[Key]> }
    : T;

export interface AuthIdentity {
  readonly type: symbol;
  readonly value: object;
}
