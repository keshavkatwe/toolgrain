// Load before provider SDKs capture fetch. Only test listeners may use real I/O.
const original = globalThis.fetch;
const mock = Symbol.for("toolgrain.test.auth-fetch");
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    return original(input, init);
  const handler = globalThis[mock];
  if (!handler)
    throw new Error(`Unexpected external fetch in runtime probe: ${url}`);
  return handler(input, init);
};
