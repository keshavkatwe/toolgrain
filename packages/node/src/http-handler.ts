import type { IncomingMessage, ServerResponse } from "node:http";
import { watchHttpConnection } from "./http-connection.js";
import { handleNodeRequest } from "./http-request.js";
import { writeHttpFailure, writeHttpResponse } from "./http-response.js";
import { requestUrl } from "./http-url.js";

export function nodeHttpHandler(
  handle: (request: Request) => Promise<Response>,
  matches?: (pathname: string) => boolean,
) {
  return async (
    input: IncomingMessage,
    output: ServerResponse,
    next?: () => void,
  ): Promise<void> => {
    const connection = watchHttpConnection(input, output);
    try {
      if (next && matches && !matches(new URL(requestUrl(input)).pathname)) {
        next();
        return;
      }
      const response = await handleNodeRequest(
        input,
        connection.signal,
        handle,
      );
      await writeHttpResponse(
        output,
        response,
        connection.signal,
        input.complete,
      );
    } catch (error) {
      await writeHttpFailure(output, connection.signal, error);
    } finally {
      connection.dispose();
    }
  };
}
