import type { ToolRequest } from "./tools/context.js";

/** Private diagnostics for an unexpected tool failure; no arguments or auth data are added. */
export interface ToolErrorDetails {
  readonly toolName: string;
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
