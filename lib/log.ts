/**
 * Structured logs: one JSON object per line, so a log pipeline can index by event.
 * Keys that look like secrets are redacted before anything is written.
 */

type Fields = Record<string, unknown>;

const SECRET_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key|hash/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Fields).map(([k, v]) => [k, SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1)]),
  );
}

function write(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  if (level === "info" && process.env.NODE_ENV === "test") return;
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...(redact(fields) as Fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
