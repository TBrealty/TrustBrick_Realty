import { useSyncExternalStore } from "react";

/** The web preview's version of local.ts: the browser's localStorage. */
export function createLocalStore<T>(name: string, fallback: T) {
  const key = `trustbrick.${name}`;
  let value: T | undefined;
  const listeners = new Set<() => void>();
  const get = (): T => {
    if (value !== undefined) return value;
    try {
      const raw = localStorage.getItem(key);
      value = raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      value = fallback;
    }
    return value;
  };
  return {
    get,
    set(next: T | ((current: T) => T)) {
      value = typeof next === "function" ? (next as (current: T) => T)(get()) : next;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
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
