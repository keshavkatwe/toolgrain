import type { McpResult, ToolMap } from "@toolgrain/mcp";
import type { MetaObject } from "@toolgrain/protocol";
import type {
  AppActionResult,
  AppDisplayMode,
  AppDisplayModeResult,
  AppHostContext,
  AppMessageParams,
  AppModelContextParams,
  AppToolResult,
} from "@toolgrain/protocol/apps";
import type { ReactNode } from "react";
import type * as core from "zod/v4/core";
import type { RequestOptions, Status } from "./client.js";

/** Exposed registration keys, independent of definition variable names. */
export type ToolName<Tools extends ToolMap> = Extract<keyof Tools, string>;
/** Wire arguments, before server defaults and transformations run. */
export type ToolInput<Tool extends ToolMap[string]> = core.input<Tool["input"]>;
type Raw<Tool extends ToolMap[string]> = Awaited<ReturnType<Tool["execute"]>>;
type Data<Value> =
  Value extends McpResult<infer Structured>
    ? Structured
    : Value extends string
      ? never
      : Value;
type Metadata<Value> =
  Value extends McpResult<infer _Structured, infer Meta> ? Meta : MetaObject;
type Output<Tool extends ToolMap[string]> = Tool extends {
  readonly output: infer Schema extends core.$ZodType;
}
  ? core.output<Schema>
  : Data<Raw<Tool>>;
/** Full wire result; data stays optional for errors and legacy revision conversion. */
export type ToolResult<Tool extends ToolMap[string]> = AppToolResult<
  Output<Tool>,
  Metadata<Raw<Tool>>
>;
/** React state for a selected tool. Values describe the wire, not direct execute() calls. */
export interface ToolState<
  Tools extends ToolMap,
  Name extends ToolName<Tools>,
> {
  readonly status: Status;
  readonly toolName: Name;
  readonly input?: ToolInput<Tools[Name]>;
  readonly result?: ToolResult<Tools[Name]>;
  readonly error?: Error;
}
/** Initial/routing state plus a discriminated union of the registered tools. */
export type AppState<Tools extends ToolMap> =
  | {
      [Name in ToolName<Tools>]: ToolState<Tools, Name>;
    }[ToolName<Tools>]
  | {
      readonly status: Status;
      readonly toolName?: undefined;
      readonly input?: Record<string, unknown>;
      readonly result?: undefined;
      readonly error?: Error;
    };
/** Provider identity, browser lifecycle settings, and explicit result routing. */
export type AppProviderProps<Tools extends ToolMap> = {
  readonly children?: ReactNode;
  readonly appInfo: { readonly name: string; readonly version: string };
  /** Default 30 seconds; may be overridden for individual calls. */
  readonly timeoutMs?: number;
  /** Optional exact host origin; omit for hosts using opaque-origin sandboxes. */
  readonly hostOrigin?: string;
  /** Apply host theme variables/fonts; defaults to true. */
  readonly applyHostStyles?: boolean;
  /** Report content dimensions with ResizeObserver; defaults to true. */
  readonly autoResize?: boolean;
  /** Modes this widget can render; defaults to ["inline"] and is fixed until remount. */
  readonly availableDisplayModes?: readonly AppDisplayMode[];
} & (
  | { readonly tool: ToolName<Tools>; readonly resolveTool?: never }
  | {
      readonly tool?: never;
      /** Use an application-owned result marker; undefined is an explicit routing failure. */
      readonly resolveTool: (
        result: ToolResult<Tools[ToolName<Tools>]>,
        host: AppHostContext,
      ) => ToolName<Tools> | undefined;
    }
);
/** State for one interactive call hook, independent of the initiating result. */
export interface ToolCall<Tool extends ToolMap[string]> {
  readonly pending: boolean;
  readonly result?: ToolResult<Tool>;
  readonly error?: unknown;
  /** Explicit tool errors resolve normally; JSON-RPC/transport failures reject. */
  readonly call: (
    input: ToolInput<Tool>,
    options?: RequestOptions,
  ) => Promise<ToolResult<Tool>>;
}
/** Optional local cancellation and per-call deadline. */
export type ToolCallOptions = RequestOptions;

/** Availability after initialization. Booleans report action advertisements; each payload's content kinds are checked separately. */
export interface HostActionAvailability {
  readonly openLink: boolean;
  readonly sendMessage: boolean;
  readonly updateModelContext: boolean;
  /** Intersection of provider-declared and host-advertised modes; empty when unavailable. */
  readonly displayModes: readonly AppDisplayMode[];
}
/** Optional AbortSignal and deadline override for one host request. */
export type HostActionOptions = RequestOptions;
/** Named native host actions with no automatic requests or pending/error cache.
 * Full acknowledgements resolve, including isError denials; unsupported requests,
 * invalid replies, RPC/transport failures, aborts, and deadlines reject.
 */
export interface HostActions {
  readonly available: HostActionAvailability;
  /** Request an absolute URL through the host's opener and permission policy. */
  readonly openLink: (
    url: string,
    options?: HostActionOptions,
  ) => Promise<AppActionResult>;
  /** Submit a user message; requested content kinds must be advertised by the host. */
  readonly sendMessage: (
    params: AppMessageParams,
    options?: HostActionOptions,
  ) => Promise<AppActionResult>;
  /** Replace the app's context for future turns; does not itself request a model follow-up. */
  readonly updateModelContext: (
    params: AppModelContextParams,
    options?: HostActionOptions,
  ) => Promise<AppActionResult>;
  /** Return the host's actual mode. Host-context notifications remain the live context source. */
  readonly requestDisplayMode: (
    mode: AppDisplayMode,
    options?: HostActionOptions,
  ) => Promise<AppDisplayModeResult>;
}
