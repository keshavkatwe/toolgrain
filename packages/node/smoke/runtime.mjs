import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createServer } from "@toolgrain/mcp";
import { createNodeHttpHandler, stdio } from "@toolgrain/node";

assert.equal(
  typeof createNodeHttpHandler(
    createServer({ name: "smoke", version: "1", tools: {} }),
  ),
  "function",
);

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

const { http } = await import("@toolgrain/node");
const hosted = createServer({
  name: "listener-smoke",
  version: "1",
  tools: {},
});
const listener = http({ port: 0 });
await hosted.listen(listener);
assert.equal(
  (await fetch(`http://127.0.0.1:${listener.address().port}/mcp`)).status,
  405,
);
await hosted.close();
assert.equal(listener.address(), undefined);
