import type { AppActionResult } from "@toolgrain/protocol/apps";
import { createApp } from "@toolgrain/react";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { tools } from "./tools.js";
import "./widget.css";

const {
  AppProvider,
  useToolResult,
  useToolCall,
  useHostContext,
  useHostActions,
} = createApp<typeof tools>();
const entry = import.meta.env.MODE;

function accepted(result: AppActionResult, message: string) {
  if (result.isError) throw new Error("The host declined this action.");
  return message;
}

function HostControls({
  summary,
  selection,
}: {
  summary: string;
  selection: Record<string, unknown>;
}) {
  const actions = useHostActions();
  const context = useHostContext();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const mode = context.displayMode === "fullscreen" ? "inline" : "fullscreen";
  async function run(action: () => Promise<string>) {
    setPending(true);
    setNotice("");
    setError("");
    try {
      setNotice(await action());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Host action failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <aside className="host-actions" aria-label="Host actions">
      <p>Host actions run when you click. Unavailable actions are disabled.</p>
      <div className="actions">
        <button
          type="button"
          disabled={pending || !actions.available.openLink}
          onClick={() => {
            void run(async () =>
              accepted(
                await actions.openLink(
                  "https://github.com/keshavkatwe/toolgrain",
                ),
                "Source link requested.",
              ),
            );
          }}
        >
          Open source
        </button>
        <button
          type="button"
          disabled={pending || !actions.available.sendMessage}
          onClick={() => {
            void run(async () =>
              accepted(
                await actions.sendMessage({
                  role: "user",
                  content: [
                    { type: "text", text: `Explain this view: ${summary}` },
                  ],
                }),
                "Explanation requested in the conversation.",
              ),
            );
          }}
        >
          Explain this view
        </button>
        <button
          type="button"
          disabled={pending || !actions.available.updateModelContext}
          onClick={() => {
            void run(async () =>
              accepted(
                await actions.updateModelContext({
                  structuredContent: selection,
                }),
                "Selection shared for future conversation turns.",
              ),
            );
          }}
        >
          Share selection
        </button>
        <button
          type="button"
          disabled={pending || !actions.available.displayModes.includes(mode)}
          onClick={() => {
            void run(async () => {
              const result = await actions.requestDisplayMode(mode);
              return `Host selected ${result.mode} mode.`;
            });
          }}
        >
          {mode === "fullscreen" ? "Expand" : "Return inline"}
        </button>
      </div>
      <p role="status">{pending ? "Waiting for the host…" : notice}</p>
      {error ? <p role="alert">{error}</p> : null}
    </aside>
  );
}

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
      {data?.structuredContent ? (
        <HostControls
          summary={`${data.structuredContent.city}, ${data.structuredContent.temperature}°C`}
          selection={{ view: "weather", ...data.structuredContent }}
        />
      ) : null}
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
      {data?.structuredContent ? (
        <HostControls
          summary={`${data.structuredContent.region} sales, $${data.structuredContent.total}`}
          selection={{ view: "sales", ...data.structuredContent }}
        />
      ) : null}
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
      availableDisplayModes={["inline", "fullscreen"]}
      {...routing}
    >
      <View />
    </AppProvider>
  </StrictMode>,
);
