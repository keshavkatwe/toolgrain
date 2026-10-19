import { testHttpExample } from "@toolgrain/repo-tools/http-example";
import { it } from "vitest";

it("serves MCP through the application's native start command", async () => {
  await testHttpExample(new URL("../", import.meta.url));
}, 60000);
