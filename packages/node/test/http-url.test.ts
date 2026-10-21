import type { IncomingMessage } from "node:http";
import { expect, it } from "vitest";
import { requestUrl } from "../src/http-url.js";

const input = (host: string | undefined, url?: string, encrypted?: boolean) =>
  ({
    headers: {
      host,
      "x-forwarded-host": "evil.example.com",
      "x-forwarded-proto": "https",
    },
    ...(url === undefined ? {} : { url }),
    socket: { encrypted },
  }) as unknown as IncomingMessage;

it("preserves targets and ports, detects direct TLS, and ignores forwarded headers", () => {
  expect(
    requestUrl(input("api.example.com:8443", "/public/mcp?trace=1", true)),
  ).toBe("https://api.example.com:8443/public/mcp?trace=1");
  expect(requestUrl(input("localhost:3000", "/mcp", false))).toBe(
    "http://localhost:3000/mcp",
  );
  expect(requestUrl(input("[::1]:3000"))).toBe("http://[::1]:3000/");
});
it.each([
  [undefined, "/mcp"],
  ["api.example.com", "https://evil.example.com/mcp"],
  ["api.example.com", "//evil.example.com/mcp"],
  ["api.example.com", "/\\evil.example.com"],
  ["api.example.com", "/mcp#fragment"],
  ["api.example.com/path", "/mcp"],
  ["user@api.example.com", "/mcp"],
  ["api.example.com,evil.example.com", "/mcp"],
  ["bad:port", "/mcp"],
])("rejects malformed or ambiguous HTTP targets %s %s", (host, url) => {
  expect(() => requestUrl(input(host, url))).toThrow(
    "Invalid HTTP request URL",
  );
});
