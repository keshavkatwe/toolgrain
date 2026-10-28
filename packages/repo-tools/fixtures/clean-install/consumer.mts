import { clerk, useAuth as useClerkAuth } from "@toolgrain/clerk";
import { createHttpHandler } from "@toolgrain/http";
import { jwt, useAuth as useJwtAuth } from "@toolgrain/jwt";
import {
  content,
  createContext,
  createServer,
  mcpResult,
  resource,
  type ToolContext,
  tool,
  toolContext,
} from "@toolgrain/mcp";
import { createNodeHttpHandler, http, stdio } from "@toolgrain/node";
import { PROTOCOL_VERSION } from "@toolgrain/protocol";
import type { InitializeRequest } from "@toolgrain/protocol/2025-06-18";
import { z } from "zod";

export const greeting = createContext({
  name: "greeting",
  resolve: () => ({ prefix: "Hello" }),
});

export const greet = tool({
  title: "Greeting",
  annotations: { readOnlyHint: true },
  input: z.object({ name: z.string().trim().min(1) }),
  output: z.object({ message: z.string() }),
  async execute({ name }, ctx) {
    const { prefix } = await greeting.use(ctx);
    await ctx.reportProgress({ progress: 0.5, total: 1, message: "Working" });
    await ctx.reportProgress({ progress: 1, total: 1, message: "Done" });
    return mcpResult({
      content: [],
      structuredContent: { message: `${prefix}, ${name}!` },
    });
  },
});

export const report = tool({
  input: z.object({}),
  output: z.object({ count: z.string().transform(Number).pipe(z.number()) }),
  execute: () =>
    mcpResult({
      content: [
        content.text("Report ready"),
        content.image({
          data: new Uint8Array([0, 128, 255]),
          mimeType: "image/png",
        }),
        content.audio({ data: "AID/", mimeType: "audio/wav" }),
        content.resourceLink({
          uri: "https://example.com/report.pdf",
          name: "report.pdf",
        }),
        content.resource(
          {
            uri: "report:///summary.txt",
            text: "Résumé 世界",
            _meta: { "example.com/resource": true },
          },
          {
            _meta: { "example.com/block": true },
          },
        ),
        content.resource({
          uri: "report:///data.bin",
          blob: new Uint8Array([255]),
        }),
      ],
      structuredContent: { count: "2" },
    }),
});

export function server() {
  return createServer({
    name: "clean-install",
    version: "1.0.0",
    tools: { greet, report },
    context: [greeting],
    resources: [
      resource({
        uri: "docs://guide",
        name: "guide",
        mimeType: "text/plain",
        icons: [{ src: "https://example.com/guide.svg" }],
        async read(uri, ctx) {
          const { prefix } = await greeting.use(ctx);
          return {
            contents: [
              {
                uri,
                text: `${prefix}: resource`,
                _meta: { "example.com/content": true },
              },
              { uri: "docs://binary", blob: "YQ==" },
            ],
            _meta: { "example.com/result": true },
          };
        },
      }),
    ],
  });
}

export const webHandler = (hosted: ReturnType<typeof server>) =>
  createHttpHandler(hosted);
export const nodeHandler = (hosted: ReturnType<typeof server>) =>
  createNodeHttpHandler(hosted);
export const listener = () => http({ port: 0 });

export const jwtProvider = (scopesSupported?: readonly string[]) =>
  jwt({
    issuer: "https://auth.example.com",
    ...(scopesSupported === undefined ? {} : { scopesSupported }),
  });
export const clerkProvider = (scopesSupported?: readonly string[]) =>
  clerk({
    publishableKey: "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk",
    secretKey: "sk_test_example",
    ...(scopesSupported === undefined ? {} : { scopesSupported }),
  });

// Check inferred values and rejected inputs against the installed declarations.
function typeChecks(ctx: ToolContext, legacy: InitializeRequest) {
  const protocol: string = PROTOCOL_VERSION;
  const revision: string = legacy.params.protocolVersion;
  const issuer: string = useJwtAuth(ctx).claims.iss;
  const userId: string = useClerkAuth(ctx).userId;
  const scopes: readonly string[] = useClerkAuth(ctx).scopes;
  const service: Promise<{ prefix: string }> = greeting.use(ctx);
  // @ts-expect-error Input inference must reject a numeric name.
  void greet.execute({ name: 42 }, ctx);
  // @ts-expect-error Provider overrides must preserve the inferred value type.
  greeting.provide(() => ({ prefix: 42 }));
  void [protocol, revision, issuer, userId, scopes, service];
}
void typeChecks;

export const directContext = () =>
  toolContext({
    context: [greeting.provide(() => ({ prefix: "Welcome" }))],
  });

if (process.argv[2] === "stdio") await server().listen(stdio());

if (process.argv[2] === "stdio-cancellation") {
  await createServer({
    name: "cancellation",
    version: "1",
    tools: {
      wait: tool({
        input: z.object({}),
        async execute(_input, ctx) {
          await ctx.reportProgress({ progress: 0.5, message: "Waiting" });
          process.stderr.write("started\n");
          await new Promise<void>((resolve) => {
            ctx.signal.addEventListener(
              "abort",
              () => {
                process.stderr.write("aborted\n");
                resolve();
              },
              { once: true },
            );
          });
          return "cancelled";
        },
      }),
    },
  }).listen(stdio());
}
