import { it } from "vitest";
import { testHttpExample } from "../../../scripts/test-http-example.mjs";

it("serves MCP through the application's native start command", async () => {
  await testHttpExample(new URL("../", import.meta.url));
}, 60000);
