import type { IncomingMessage, ServerResponse } from "node:http";
import { createHttpHandler, type HttpOptions } from "@toolgrain/http";
import type { Server } from "@toolgrain/mcp";
import { watchHttpConnection } from "./http-connection.js";
import { handleNodeRequest } from "./http-request.js";
import { writeHttpFailure, writeHttpResponse } from "./http-response.js";

/** Mount before body parsing middleware. Does not own or close the HTTP listener. */
export function createNodeHttpHandler(server: Server, options?: HttpOptions) {
  const handle = createHttpHandler(server, options);
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
