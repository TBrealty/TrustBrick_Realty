/**
 * One error vocabulary for every service, action and route handler. Services throw
 * AppError; actions turn it into an ActionResult; nothing internal (SQL, stack traces,
 * constraint names) ever reaches the browser.
 */

export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHORIZED: "Please log in to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find that. It may have been removed, or you may not have access to it.",
  VALIDATION_ERROR: "Please check the highlighted fields.",
  CONFLICT: "That changed while you were working on it. Refresh and try again.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
};

export type FieldErrors = Record<string, string>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: FieldErrors;

  constructor(code: ErrorCode, message?: string, fieldErrors?: FieldErrors) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const forbidden = (message?: string) => new AppError("FORBIDDEN", message);
export const notFound = (message?: string) => new AppError("NOT_FOUND", message);
export const conflict = (message: string) => new AppError("CONFLICT", message);
export const invalid = (message: string, fieldErrors?: FieldErrors) => new AppError("VALIDATION_ERROR", message, fieldErrors);

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; code: ErrorCode; message: string; fieldErrors?: FieldErrors };

export function failure(error: AppError): Extract<ActionResult, { ok: false }> {
  return { ok: false, code: error.code, message: error.message, fieldErrors: error.fieldErrors };
}

export function internalFailure(): Extract<ActionResult, { ok: false }> {
  return { ok: false, code: "INTERNAL_ERROR", message: DEFAULT_MESSAGES.INTERNAL_ERROR };
}

/** Postgres unique violation on a named constraint, for turning races into a CONFLICT. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = (error as { cause?: unknown })?.cause ?? error;
  const pg = e as { code?: string; constraint?: string };
  return pg?.code === "23505" && (constraint === undefined || pg.constraint === constraint);
}
