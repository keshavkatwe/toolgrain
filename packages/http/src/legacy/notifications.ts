import { type ObjectValue, object } from "../object.js";

/** Cancellation is advisory: independent POSTs have no shared client identity. */
export function acceptsNotification(body: ObjectValue): boolean {
  if (Object.hasOwn(body, "result") || Object.hasOwn(body, "error"))
    return false;
  const params = body.params === undefined ? {} : object(body.params);
  if (!params) return false;
  if (params._meta !== undefined && !object(params._meta)) return false;
  if (body.method === "notifications/initialized") return true;
  if (body.method !== "notifications/cancelled") return false;
  return (
    (typeof params.requestId === "string" ||
      (typeof params.requestId === "number" &&
        Number.isFinite(params.requestId) &&
        Number.isInteger(params.requestId))) &&
    (params.reason === undefined || typeof params.reason === "string")
  );
}
