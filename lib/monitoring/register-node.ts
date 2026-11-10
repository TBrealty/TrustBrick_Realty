import { describe, reportError } from "./alerts";

/** Node.js only (instrumentation.ts loads it there): a promise left to fail is reported too. */
export function registerNode() {
  process.on("unhandledRejection", (reason) => {
    void reportError({ source: "server", kind: "unhandled promise rejection", ...describe(reason) });
  });
}
