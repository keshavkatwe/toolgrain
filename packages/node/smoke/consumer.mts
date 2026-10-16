import { PassThrough } from "node:stream";
import type { Transport } from "@toolgrain/mcp";
import { type StdioOptions, stdio } from "@toolgrain/node";

const options: StdioOptions = {
  input: new PassThrough(),
  output: new PassThrough(),
  maxMessageBytes: 4096,
};
const transport: Transport = stdio(options);
await transport.close();
