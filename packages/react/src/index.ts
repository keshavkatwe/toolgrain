import type { ToolMap } from "@toolgrain/mcp";
import type { AppHostContext, AppToolResult } from "@toolgrain/protocol/apps";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppClient, type RequestOptions } from "./client.js";
import { presentation } from "./presentation.js";
import type {
  AppProviderProps,
  AppState,
  ToolCall,
  ToolInput,
  ToolName,
  ToolResult,
  ToolState,
} from "./types.js";

export type {
  AppProviderProps,
  AppState,
  ToolCall,
  ToolCallOptions,
  ToolInput,
  ToolName,
  ToolResult,
  ToolState,
} from "./types.js";

/**
 * Create native React Apps bindings without accessing the browser or opening a
 * connection. Import the registered tools using `import type`; server handlers
 * and their dependencies are never needed at runtime by this package.
 */
export function createApp<Tools extends ToolMap>() {
  const Context = createContext<AppClient | undefined>(undefined);
  const useClient = () => {
    const client = useContext(Context);
    if (!client) throw new Error("Apps hooks require their AppProvider");
    return client;
  };
  /** Own one connection. Identity/routing settings are fixed until this provider remounts. */
  function AppProvider(props: AppProviderProps<Tools>) {
    const [client] = useState(() => {
      if ((props.tool === undefined) === (props.resolveTool === undefined))
        throw new TypeError("Supply exactly one of tool or resolveTool");
      return new AppClient({
        appInfo: props.appInfo,
        ...(props.tool === undefined ? {} : { tool: props.tool }),
        ...(props.resolveTool === undefined
          ? {}
          : {
              resolveTool: props.resolveTool as (
                result: AppToolResult,
                host: AppHostContext,
              ) => string | undefined,
            }),
        ...(props.timeoutMs === undefined
          ? {}
          : { timeoutMs: props.timeoutMs }),
        ...(props.hostOrigin === undefined
          ? {}
          : { hostOrigin: props.hostOrigin }),
      });
    });
    const leases = useRef(0);
    useEffect(() => {
      leases.current++;
      const cleanup = presentation(
        client,
        window,
        props.applyHostStyles !== false,
        props.autoResize !== false,
      );
      void client.start(window);
      return () => {
        cleanup();
        leases.current--;
        // Strict Mode releases/reacquires synchronously. A real unmount closes
        // after that opportunity, without leaking a connection past the microtask.
        queueMicrotask(() => {
          if (leases.current === 0) client.close();
        });
      };
    }, [client, props.applyHostStyles, props.autoResize]);
    return createElement(Context.Provider, { value: client }, props.children);
  }
  function useToolResult(): AppState<Tools>;
  function useToolResult<Name extends ToolName<Tools>>(
    name: Name,
  ): ToolState<Tools, Name>;
  /** Subscribe to retained initiating data; a name filters and narrows the result. */
  function useToolResult(
    name?: ToolName<Tools>,
  ): AppState<Tools> | ToolState<Tools, ToolName<Tools>> {
    const client = useClient();
    const snapshot = useSyncExternalStore(
      client.subscribe,
      client.getSnapshot,
      client.getSnapshot,
    );
    if (name !== undefined && snapshot.toolName !== name)
      return { status: "waiting", toolName: name };
    return snapshot as unknown as AppState<Tools>;
  }
  /** Subscribe to the current host presentation context; claims are unverified. */
  function useHostContext(): AppHostContext {
    const client = useClient();
    return useSyncExternalStore(
      client.subscribe,
      client.getSnapshot,
      client.getSnapshot,
    ).host;
  }
  /** Track an interactive call independently; the latest invocation owns hook state. */
  function useToolCall<Name extends ToolName<Tools>>(
    name: Name,
  ): ToolCall<Tools[Name]> {
    const client = useClient();
    const token = useRef(0);
    const [state, setState] = useState<{
      name: Name;
      pending: boolean;
      result?: ToolResult<Tools[Name]>;
      error?: unknown;
    }>({ name, pending: false });
    // biome-ignore lint/correctness/useExhaustiveDependencies: Changing either binding invalidates pending completions, including cleanup-only effects.
    useEffect(
      () => () => {
        token.current++;
      },
      [client, name],
    );
    const call = useCallback(
      async (input: ToolInput<Tools[Name]>, options?: RequestOptions) => {
        const invocation = ++token.current;
        setState({ name, pending: true });
        try {
          const result = (await client.callTool(
            name,
            input,
            options,
          )) as ToolResult<Tools[Name]>;
          if (token.current === invocation)
            setState({ name, pending: false, result });
          return result;
        } catch (error) {
          if (token.current === invocation)
            setState({ name, pending: false, error });
          throw error;
        }
      },
      [client, name],
    );
    return { ...(state.name === name ? state : { pending: false }), call };
  }
  return { AppProvider, useToolResult, useToolCall, useHostContext };
}
