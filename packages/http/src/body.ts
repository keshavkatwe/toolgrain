export class BodyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readBody(
  request: Request,
  limit: number,
): Promise<unknown> {
  if (!request.body) throw new BodyError(400, "Missing body");
  if (request.bodyUsed || request.body.locked)
    throw new BodyError(400, "Request body has already been consumed");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new BodyError(413, "Message too large");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof BodyError) throw error;
    throw new BodyError(400, "Parse error");
  } finally {
    reader.releaseLock();
  }
}
