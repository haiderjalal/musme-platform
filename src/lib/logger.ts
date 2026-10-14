import "server-only";

type LogLevel = "info" | "warn" | "error";
type LogValue = string | number | boolean | null | undefined;

// Keys that may carry personal data or secrets are never written to logs.
const SENSITIVE_KEY = /email|phone|token|secret|key|password|body|address|message/i;

/** Writes one structured JSON line. Use short event names such as "booking.hold_created". */
export function logEvent(
  level: LogLevel,
  event: string,
  context: Record<string, LogValue> = {},
): void {
  const safeContext = Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[redacted]" : value,
    ]),
  );
  const line = `${JSON.stringify({ time: new Date().toISOString(), level, event, ...safeContext })}\n`;
  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}
