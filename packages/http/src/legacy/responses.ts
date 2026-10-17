import type { ObjectValue } from "../object.js";
import { responseId } from "../responses.js";

export const errorId = (body?: ObjectValue) => ({
  id: responseId(body) ?? null,
});
export const responseStatus = () => 200;
