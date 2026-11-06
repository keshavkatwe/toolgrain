import { createApp } from "@toolgrain/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { tools } from "./tools.js";
import "./widget.css";

const { AppProvider, useToolResult, useToolCall, useHostContext } =
  createApp<typeof tools>();
const entry = import.meta.env.MODE;

function Weather({ name }: { name: "weather" | "shared_weather" }) {
  const initial = useToolResult(name);
  const refresh = useToolCall(name);
  const data = refresh.result ?? initial.result;
  return (
    <section>
      <h1>Weather</h1>
      <p>
        {data?.structuredContent?.city}: {data?.structuredContent?.temperature}
        °C
      </p>
      <p>Demo forecast: {data?._meta?.forecast.join(" · ")}</p>
      <button
        type="button"
        disabled={refresh.pending}
        onClick={() => {
          void refresh
            .call({
              city:
                data?.structuredContent?.city === "Dubai" ? "London" : "Dubai",
            })
            .catch(() => {});
        }}
      >
        Switch city
      </button>
      {refresh.error ? <p role="alert">Refresh failed. Try again.</p> : null}
    </section>
  );
}
function Sales({ name }: { name: "sales" | "shared_sales" }) {
  const initial = useToolResult(name);
  const refresh = useToolCall(name);
  const data = refresh.result ?? initial.result;
  return (
    <section>
      <h1>Sales</h1>
      <p>
        {data?.structuredContent?.region}: $
        {data?.structuredContent?.total.toLocaleString()}
      </p>
      <div className="bars">
        {data?._meta?.points.map((point) => (
          <span key={point} style={{ height: `${point * 3}px` }} />
        ))}
      </div>
      <button
        type="button"
        disabled={refresh.pending}
        onClick={() => {
          void refresh
            .call({
              region:
                data?.structuredContent?.region === "East" ? "West" : "East",
            })
            .catch(() => {});
        }}
      >
        Switch region
      </button>
      {refresh.error ? <p role="alert">Refresh failed. Try again.</p> : null}
    </section>
  );
}
function View() {
  const state = useToolResult();
  const context = useHostContext();
  if (state.error) return <p role="alert">{state.error.message}</p>;
  if (!state.result) return <p>Loading widget…</p>;
  return (
    <main data-theme={context.theme}>
      {state.toolName === "weather" || state.toolName === "shared_weather" ? (
        <Weather name={state.toolName} />
      ) : (
        <Sales name={state.toolName} />
      )}
    </main>
  );
}
const routing =
  entry === "weather"
    ? { tool: "weather" as const }
    : entry === "sales"
      ? { tool: "sales" as const }
      : {
          resolveTool: (result: { _meta?: { view: string } }) =>
            result._meta?.view === "weather"
              ? ("shared_weather" as const)
              : result._meta?.view === "sales"
                ? ("shared_sales" as const)
                : undefined,
        };
const element = document.getElementById("root");
if (!element) throw new Error("Missing widget root");
createRoot(element).render(
  <StrictMode>
    <AppProvider
      appInfo={{ name: "Toolgrain demo", version: "1.0.0" }}
      {...routing}
    >
      <View />
    </AppProvider>
  </StrictMode>,
);
