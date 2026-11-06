import { APPS_EXTENSION_ID, APPS_MIME_TYPE } from "@toolgrain/protocol/apps";
import { expect, it } from "vitest";
import { getAppSupport, mcpResult, toolContext } from "../src/index.js";

it("reads only the current client's advisory capability claim", () => {
  expect(getAppSupport(toolContext())).toBe("unknown");
  for (const capabilities of [
    {},
    { extensions: {} },
    { extensions: { [APPS_EXTENSION_ID]: {} } },
    { extensions: { [APPS_EXTENSION_ID]: { mimeTypes: ["text/html"] } } },
  ]) {
    expect(
      getAppSupport(toolContext({ request: { client: { capabilities } } })),
    ).toBe("not-advertised");
  }
  expect(
    getAppSupport(
      toolContext({
        request: {
          client: {
            capabilities: {
              extensions: {
                [APPS_EXTENSION_ID]: { mimeTypes: [APPS_MIME_TYPE] },
              },
            },
          },
        },
      }),
    ),
  ).toBe("supported");
});
it("retains result metadata inference without changing the envelope", () => {
  const result = mcpResult({
    content: [],
    structuredContent: { value: 1 },
    _meta: { view: "chart" },
  });
  const view: "chart" | undefined = result.value._meta?.view;
  expect(view).toBe("chart");
});
