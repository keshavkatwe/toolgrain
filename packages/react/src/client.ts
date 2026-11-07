import type { Implementation } from "@toolgrain/protocol";
import {
  APPS_PROTOCOL_VERSION,
  type AppHostCapabilities,
  type AppHostContext,
  type AppToolResult,
} from "@toolgrain/protocol/apps";
import * as wire from "./validation.js";

export interface ClientOptions {
  appInfo: Implementation;
  tool?: string;
  resolveTool?: (
    result: AppToolResult,
    host: AppHostContext,
  ) => string | undefined;
  timeoutMs?: number;
  hostOrigin?: string;
}
export type Status =
  | "connecting"
  | "waiting"
  | "running"
  | "success"
  | "tool-error"
  | "cancelled"
  | "error"
  | "closed";
export interface Snapshot {
  status: Status;
  toolName?: string | undefined;
  input?: Record<string, unknown> | undefined;
  result?: AppToolResult | undefined;
  error?: Error | undefined;
  host: AppHostContext;
}
export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
type Pending = { resolve(value: unknown): void; reject(reason: unknown): void };
let nextConnection = 0;
const ownership = Symbol.for("@toolgrain/react/connection@1");

export function deadline(value = 30_000) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
    throw new TypeError("timeoutMs must be a positive timer interval");
  return value;
}

/** Internal native iframe connection; importing it does not access browser globals. */
export class AppClient {
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private pending = new Map<string | number, Pending>();
  private sequence = 0;
  private prefix = `toolgrain:${++nextConnection}:`;
  private target: Window | undefined;
  private browser: Window | undefined;
  private ready = false;
  private cancelled = false;
  private started = false;
  private closed = false;
  private capabilities: AppHostCapabilities = {};

  constructor(private readonly options: ClientOptions) {
    deadline(options.timeoutMs);
    if (!options.appInfo.name || !options.appInfo.version)
      throw new TypeError("App name and version are required");
    this.snapshot = { status: "connecting", host: {}, toolName: options.tool };
  }
  readonly isClosed = () => this.closed;
  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  async start(browser: Window) {
    if (this.started || this.closed) return;
    this.started = true;
    const owner = browser as unknown as { [ownership]?: AppClient };
    try {
      if (browser.parent === browser)
        throw new Error("MCP Apps require an embedding host");
      if (owner[ownership])
        throw new Error("Only one AppProvider may connect in a widget window");
      owner[ownership] = this;
      this.browser = browser;
      this.target = browser.parent;
      browser.addEventListener("message", this.receive);
      const raw = await this.request("ui/initialize", {
        protocolVersion: APPS_PROTOCOL_VERSION,
        appInfo: this.options.appInfo,
        appCapabilities: { availableDisplayModes: ["inline"] },
      });
      if (this.closed) return;
      const result = wire.initialized.parse(raw);
      if (result.protocolVersion !== APPS_PROTOCOL_VERSION)
        throw new Error("Unsupported MCP Apps revision");
      this.capabilities =
        result.hostCapabilities as unknown as AppHostCapabilities;
      this.ready = true;
      this.snapshot = {
        ...this.snapshot,
        status: "waiting",
        host: (result.hostContext ?? {}) as unknown as AppHostContext,
      };
      this.notify("ui/notifications/initialized", {});
      this.update({});
    } catch (error) {
      if (!this.closed)
        this.close(
          error instanceof Error
            ? error
            : new Error("Apps initialization failed"),
        );
    }
  }
  private send(message: object) {
    if (!this.target || this.closed)
      throw new Error("Apps connection is closed");
    this.target.postMessage(message, this.options.hostOrigin ?? "*");
  }
  private notify(method: string, params: object) {
    this.send({ jsonrpc: "2.0", method, params });
  }
  private request(
    method: string,
    params: object,
    options: RequestOptions = {},
  ): Promise<unknown> {
    if (this.closed)
      return Promise.reject(new Error("Apps connection is closed"));
    const timeout = deadline(options.timeoutMs ?? this.options.timeoutMs);
    if (options.signal?.aborted) return Promise.reject(options.signal.reason);
    const id = `${this.prefix}${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const finish = (callback: (value: never) => void, value: unknown) => {
        this.pending.delete(id);
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        callback(value as never);
      };
      const cancel = (reason: unknown) => {
        finish(reject, reason);
        if (!this.closed && this.ready) {
          try {
            this.notify("notifications/cancelled", {
              requestId: id,
              reason: "Request cancelled",
            });
          } catch {
            /* Local cancellation still settles. */
          }
        }
      };
      const abort = () => cancel(options.signal?.reason);
      const timer = setTimeout(
        () => cancel(new Error("Apps request timed out")),
        timeout,
      );
      this.pending.set(id, {
        resolve: (value) => finish(resolve, value),
        reject: (reason) => finish(reject, reason),
      });
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        this.send({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        finish(reject, error);
      }
    });
  }
  async callTool(
    name: string,
    args: unknown,
    options?: RequestOptions,
  ): Promise<AppToolResult> {
    if (!this.ready || this.closed)
      throw new Error("Apps connection is not ready");
    if (!this.capabilities.serverTools)
      throw new Error("Host does not support server tool calls");
    return wire.toolResult.parse(
      await this.request(
        "tools/call",
        { name, arguments: wire.argumentsObject.parse(args) },
        options,
      ),
    ) as unknown as AppToolResult;
  }
  size(width: number, height: number) {
    if (this.ready && !this.closed) {
      try {
        this.notify("ui/notifications/size-changed", { width, height });
      } catch (error) {
        this.close(
          error instanceof Error
            ? error
            : new Error("Size notification failed"),
        );
      }
    }
  }
  private readonly receive = (event: MessageEvent) => {
    try {
      this.receiveMessage(event);
    } catch (error) {
      this.close(
        error instanceof Error ? error : new Error("Invalid host message"),
      );
    }
  };
  private receiveMessage(event: MessageEvent) {
    if (
      this.closed ||
      event.source !== this.target ||
      (this.options.hostOrigin && event.origin !== this.options.hostOrigin)
    )
      return;
    const parsed = wire.envelope.safeParse(event.data);
    if (!parsed.success) return;
    const message = parsed.data;
    if (!message.method) {
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      if ((message.result !== undefined) === (message.error !== undefined)) {
        pending.reject(new Error("Invalid host response"));
        return;
      }
      if (message.error !== undefined) {
        const error = wire.rpcError.safeParse(message.error);
        pending.reject(
          error.success
            ? Object.assign(new Error(error.data.message), {
                code: error.data.code,
                data: error.data.data,
              })
            : new Error("Invalid host error"),
        );
      } else pending.resolve(message.result);
      return;
    }
    if (!this.ready) return;
    if (message.id !== undefined) {
      if (["ping", "ui/resource-teardown"].includes(message.method)) {
        this.send({ jsonrpc: "2.0", id: message.id, result: {} });
        if (message.method === "ui/resource-teardown") this.close();
      } else
        this.send({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: "Method not found" },
        });
      return;
    }
    switch (message.method) {
      case "ui/notifications/tool-input": {
        const input = wire.input.safeParse(message.params);
        if (input.success) {
          this.cancelled = false;
          this.update({
            status: "running",
            toolName: this.options.tool,
            input: input.data.arguments,
            result: undefined,
            error: undefined,
          });
        }
        break;
      }
      case "ui/notifications/tool-result": {
        if (this.cancelled) return;
        const result = wire.toolResult.safeParse(message.params);
        if (!result.success) {
          this.update({
            status: "error",
            result: undefined,
            error: new Error("Invalid tool result"),
          });
          break;
        }
        try {
          const toolName =
            this.options.tool ??
            this.options.resolveTool?.(
              result.data as unknown as AppToolResult,
              this.snapshot.host,
            );
          if (typeof toolName !== "string" || !toolName)
            throw new Error("Unable to route tool result; no matching tool");
          this.update({
            toolName,
            status: result.data.isError ? "tool-error" : "success",
            result: result.data as unknown as AppToolResult,
            error: undefined,
          });
        } catch (error) {
          this.update({
            status: "error",
            toolName: this.options.tool,
            error:
              error instanceof Error ? error : new Error("Tool routing failed"),
            result: undefined,
          });
        }
        break;
      }
      case "ui/notifications/tool-cancelled": {
        const value = wire.cancellation.safeParse(message.params);
        if (value.success) {
          this.cancelled = true;
          this.update({
            status: "cancelled",
            result: undefined,
            error: new Error(value.data.reason ?? "Tool cancelled"),
          });
        }
        break;
      }
      case "ui/notifications/host-context-changed": {
        const context = wire.hostContext.safeParse(message.params);
        if (context.success)
          this.update({
            host: { ...this.snapshot.host, ...context.data } as AppHostContext,
          });
        break;
      }
    }
  }
  close(error?: Error) {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.browser?.removeEventListener("message", this.receive);
    const owner = this.browser as unknown as
      | { [ownership]?: AppClient }
      | undefined;
    if (owner?.[ownership] === this) delete owner[ownership];
    this.browser = undefined;
    this.target = undefined;
    for (const pending of [...this.pending.values()])
      pending.reject(error ?? new Error("Apps connection closed"));
    this.update({ status: error ? "error" : "closed", error });
  }
}
