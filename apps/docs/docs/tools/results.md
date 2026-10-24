# Return values and rich content

Return ordinary strings and JSON data for most tools. Use `mcpResult()` when you intentionally want MCP content blocks, explicit tool errors, or result metadata.

| Handler return | Result without an output schema |
| --- | --- |
| String | Text content |
| JSON object | Structured content plus serialized text |
| JSON array, number, boolean, or null | Modern structured content plus text; legacy text only |
| `mcpResult(...)` | Explicit content and metadata after validation |

An ordinary object shaped like `{ content, isError }` is still application data. It is not interpreted as an MCP result without the helper.

## Structured data with narrative

```ts
import { mcpResult, tool } from "@toolgrain/mcp";
import { z } from "zod";

const report = tool({
  input: z.object({}),
  output: z.object({ count: z.number(), summary: z.string() }),
  execute: () => mcpResult({
    content: [{ type: "text", text: "Report complete" }],
    structuredContent: { count: 2, summary: "Two records matched." },
  }),
});
```

Toolgrain supplies a text serialization for structured content. If output parsing changes the data, text generated from the original structured data is replaced with the parsed serialization. User-authored narrative blocks remain separate.

The tested Claude Code client hides supplemental text when structured content is present. Put essential narrative in the structured data, or return text-only without an output schema when that is the intended contract. See [verified client behavior](../compatibility/clients.md).

## Content types

`mcpResult()` supports text, image, audio, resource links, embedded text/blob resources, structured JSON, `isError`, and `_meta`. Image and audio blocks carry base64 data and a MIME type. Resource links and embedded resources are result content; they do not enable the separate resources methods.

```ts
const result = mcpResult({
  content: [
    { type: "text", text: "The report is ready." },
    { type: "resource_link", uri: "https://example.com/report", name: "report" },
  ],
  _meta: { "example.com/report-id": "r_123" },
});
```

Content is validated and copied at conversion. Undefined optional envelope fields are omitted; undefined inside unparsed structured data is rejected. Legacy structured content must be object-rooted.

## Expected errors

```ts
return mcpResult({
  isError: true,
  content: [{ type: "text", text: "No matching record was found." }],
});
```

This message is intentionally public. Unexpected exceptions are kept private. Use [`McpStructuredResult<T>`](../reference/mcp.md#mcpresult) when an explicitly typed helper must promise successful structured output.
