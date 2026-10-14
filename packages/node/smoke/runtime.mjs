import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { stdio } from "@toolgrain/node";

const input = new PassThrough();
const output = new PassThrough();
const transport = stdio({ input, output });
const messages = [];
await transport.start({
  onMessage(message) {
    messages.push(message);
  },
  onParseError(error) {
    throw error;
  },
  onError(error) {
    throw error;
  },
  onClose() {},
});
input.write('{"method":"tools/list"}\n');
assert.deepEqual(messages, [{ method: "tools/list" }]);
const message = {
  jsonrpc: "2.0",
  id: 1,
  result: { resultType: "complete", content: [] },
};
await transport.send(message);
assert.equal(output.read().toString(), `${JSON.stringify(message)}\n`);
await transport.close();
