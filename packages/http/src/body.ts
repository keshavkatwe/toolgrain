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
  const abort = () => {
    void reader.cancel(request.signal.reason).catch(() => {});
  };
  request.signal.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  try {
    request.signal.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      request.signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new BodyError(413, "Message too large");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    void reader.cancel().catch(() => {});
    request.signal.throwIfAborted();
    if (error instanceof BodyError) throw error;
    throw new BodyError(400, "Parse error");
  } finally {
    request.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
