"use client";

import { useEffect } from "react";
import { reportClientError } from "./report";

/**
 * Listens for errors no part of the page caught (a crashed script, a promise left to fail) and
 * reports them. Errors that reach an error page are reported there (app/error.tsx,
 * app/global-error.tsx). Renders nothing.
 */
export function ErrorReporter() {
  useEffect(() => {
    // Only errors from our own scripts; anything else (extensions, other sites' scripts) is skipped.
    const onError = (e: ErrorEvent) => {
      if (e.filename && !e.filename.startsWith(window.location.origin)) return;
      reportClientError(e.error ?? e.message, "browser: uncaught error");
    };
    const onRejection = (e: PromiseRejectionEvent) => reportClientError(e.reason, "browser: unhandled promise rejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
