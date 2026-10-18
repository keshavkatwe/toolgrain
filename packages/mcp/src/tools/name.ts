export class ToolNameError extends Error {
  constructor(public readonly toolName: string) {
    super(
      `Invalid MCP tool name: ${JSON.stringify(toolName)}. Use 1–128 ASCII letters, digits, underscores, hyphens, or dots.`,
    );
    this.name = "ToolNameError";
  }
}

export function validateToolName(name: string): void {
  if (name.length < 1 || name.length > 128 || /[^A-Za-z0-9_.-]/.test(name))
    throw new ToolNameError(name);
}
