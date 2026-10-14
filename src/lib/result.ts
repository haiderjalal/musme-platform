/** Shape returned by every server action and route handler, so the UI handles one contract. */
export type ActionResult<T = undefined> =
  | { success: true; message: string; data: T }
  | { success: false; message: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T, message = "Saved."): ActionResult<T> {
  return { success: true, message, data };
}

export function fail(message: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return fieldErrors ? { success: false, message, fieldErrors } : { success: false, message };
}
