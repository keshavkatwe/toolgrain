import type { ToolRequest } from "./tools/context.js";

/** Private diagnostics for an unexpected tool failure; no arguments or auth data are added. */
export interface ToolErrorDetails {
  /** Exposed registration name of the tool whose execution failed. */
  readonly toolName: string;
  /** Frozen request metadata; arguments and authorization credentials are not added. */
  readonly request: ToolRequest;
}

export type ErrorHandler = (error: unknown, details?: ToolErrorDetails) => void;

/** Diagnostics cannot interrupt a response or cleanup, including rejected async callbacks. */
export function reportError(
  onError: ErrorHandler | undefined,
  error: unknown,
  details?: ToolErrorDetails,
): void {
  if (!onError) return;
  try {
    const result =
      details === undefined ? onError(error) : onError(error, details);
    void Promise.resolve(result).catch(() => {});
  } catch {
    /* Diagnostics must not replace the original failure. */
  }
}
