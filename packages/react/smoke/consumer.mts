import { mcpResult, tool } from "@toolgrain/mcp";
import { createApp, type ToolInput, type ToolResult } from "@toolgrain/react";
import { z } from "zod";
import * as mini from "zod/mini";

const original = tool({
  input: z.object({ count: z.string().default("2").transform(Number) }),
  output: z.object({ doubled: z.string().transform(Number) }),
  execute: ({ count }) =>
    mcpResult({
      content: [],
      structuredContent: { doubled: String(count * 2) },
      _meta: { view: "counter", points: [count] },
    }),
});
const tools = {
  alias: original,
  plain: tool({
    input: mini.object({ name: mini.string() }),
    execute: ({ name }) => ({ name }),
  }),
};
const errors = tool({
  input: z.object({ fail: z.boolean() }),
  output: z.object({ count: z.number() }),
  execute: ({ fail }) =>
    fail
      ? mcpResult({ content: [], isError: true, _meta: { view: "error" } })
      : mcpResult({
          content: [],
          structuredContent: { count: 1 },
          _meta: { view: "counter" },
        }),
});
const explicitError: ToolResult<typeof errors> = {
  content: [],
  isError: true,
  _meta: { view: "error" },
};
const errorData: number | undefined = explicitError.structuredContent?.count;
const errorView: "error" | "counter" | undefined = explicitError._meta?.view;
const typedError = mcpResult<{ count: number }>({ content: [], isError: true });
const typedErrorData: typeof typedError.value.structuredContent = { count: 1 };
const typedErrorMeta: typeof typedError.value._meta = { view: "error" };
const typedContent = mcpResult<{ count: number }>({ content: [] });
const typedContentData: typeof typedContent.value.structuredContent = {
  count: 1,
};
const app = createApp<typeof tools>();
const input: ToolInput<typeof original> = {};
const value: ToolResult<typeof original> = {
  content: [],
  structuredContent: { doubled: 4 },
  _meta: { view: "counter", points: [2] },
};
const number: number | undefined = value.structuredContent?.doubled;
const view: "counter" | undefined = value._meta?.view;
// @ts-expect-error Wire arguments are schema inputs, before transformation.
const badInput: ToolInput<typeof original> = { count: 2 };
const badOutput: ToolResult<typeof original> = {
  content: [],
  // @ts-expect-error The parsed output is numeric.
  structuredContent: { doubled: "4" },
};
function Hooks() {
  const call = app.useToolCall("alias");
  void call.call(input);
  // @ts-expect-error Registration keys define names.
  app.useToolCall("original");
  const result = app.useToolResult();
  if (result.toolName === "alias") {
    const inferred: number | undefined =
      result.result?.structuredContent?.doubled;
    const meta: "counter" | undefined = result.result?._meta?.view;
    void inferred;
    void meta;
  }
  return null;
}
void [
  number,
  view,
  badInput,
  badOutput,
  Hooks,
  errorData,
  errorView,
  typedErrorData,
  typedErrorMeta,
  typedContentData,
];
