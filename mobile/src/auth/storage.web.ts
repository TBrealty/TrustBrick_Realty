/**
 * The web preview (for development only) has no secure storage, so it keeps the token in the
 * browser's storage. The real app uses storage.ts.
 */
const KEY = "trustbrick.session";

export const prefs = {
  get: async (key: string) => {
    try {
      return window.localStorage.getItem(`trustbrick.${key}`);
    } catch {
      return null;
    }
  },
  set: async (key: string, value: string) => {
    try {
      window.localStorage.setItem(`trustbrick.${key}`, value);
    } catch {}
  },
  clear: async (key: string) => {
    try {
      window.localStorage.removeItem(`trustbrick.${key}`);
    } catch {}
  },
};

export const tokenStore = {
  get: async () => {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set: async (token: string) => {
    try {
      window.localStorage.setItem(KEY, token);
    } catch {}
  },
  clear: async () => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {}
  },
};
