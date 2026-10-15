import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";

/**
 * Small things the app remembers on this phone only: the chosen city, recently viewed homes,
 * the last search. Kept as JSON files in the app's documents folder (secure storage is for the
 * session token, and limits the size of each value).
 */
function read<T>(name: string, fallback: T): T {
  try {
    const file = new File(Paths.document, `${name}.json`);
    return file.exists ? (JSON.parse(file.textSync()) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(name: string, value: unknown) {
  try {
    new File(Paths.document, `${name}.json`).write(JSON.stringify(value));
  } catch {}
}

export function createLocalStore<T>(name: string, fallback: T) {
  let value: T | undefined;
  const listeners = new Set<() => void>();
  const get = () => (value === undefined ? (value = read(name, fallback)) : value);
  return {
    get,
    set(next: T | ((current: T) => T)) {
      value = typeof next === "function" ? (next as (current: T) => T)(get()) : next;
      write(name, value);
      listeners.forEach((l) => l());
    },
    useValue(): T {
      return useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        get,
        get,
      );
    },
  };
}
