import type { IncomingMessage, ServerResponse } from "node:http";
import { watchHttpConnection } from "./http-connection.js";
import { handleNodeRequest } from "./http-request.js";
import { writeHttpFailure, writeHttpResponse } from "./http-response.js";

export function nodeHttpHandler(
  handle: (request: Request) => Promise<Response>,
) {
  return async (
    input: IncomingMessage,
    output: ServerResponse,
  ): Promise<void> => {
    const connection = watchHttpConnection(input, output);
    try {
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
