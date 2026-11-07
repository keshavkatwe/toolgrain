import { mcpResult, tool } from "@toolgrain/mcp";
import { z } from "zod";

function weather(uri: string) {
  return tool({
    description:
      "Show the weather demo, with an interactive widget when available.",
    input: z.object({ city: z.enum(["Dubai", "London"]).default("Dubai") }),
    output: z.object({ city: z.string(), temperature: z.number() }),
    _meta: { ui: { resourceUri: uri } },
    execute: ({ city }) =>
      mcpResult({
        content: [
          {
            type: "text",
            text: `Demo weather in ${city}: ${city === "Dubai" ? 29 : 14}°C.`,
          },
        ],
        structuredContent: { city, temperature: city === "Dubai" ? 29 : 14 },
        _meta: { view: "weather", forecast: [24, 26, 29, 27] },
      }),
  });
}
function sales(uri: string) {
  return tool({
    description:
      "Show sales demo data, with an interactive widget when available.",
    input: z.object({ region: z.enum(["East", "West"]).default("East") }),
    output: z.object({ region: z.string(), total: z.number() }),
    _meta: { ui: { resourceUri: uri } },
    execute: ({ region }) =>
      mcpResult({
        content: [
          {
            type: "text",
            text: `Demo sales for ${region}: ${region === "East" ? 42000 : 31000} USD.`,
          },
        ],
        structuredContent: { region, total: region === "East" ? 42000 : 31000 },
        _meta: { view: "sales", points: [10, 20, 15, 30] },
      }),
  });
}
export const tools = {
  weather: weather("ui://demo/weather.html"),
  sales: sales("ui://demo/sales.html"),
  shared_weather: weather("ui://demo/shared.html"),
  shared_sales: sales("ui://demo/shared.html"),
};
