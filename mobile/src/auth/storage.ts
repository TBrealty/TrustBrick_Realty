import * as SecureStore from "expo-secure-store";

/** The session token lives in the phone's secure storage (Android Keystore, iOS Keychain). */
const KEY = "trustbrick.session";

/** Small preferences (the app's mode), in the same storage. */
export const prefs = {
  get: (key: string) => SecureStore.getItemAsync(`trustbrick.${key}`),
  set: (key: string, value: string) => SecureStore.setItemAsync(`trustbrick.${key}`, value),
  clear: (key: string) => SecureStore.deleteItemAsync(`trustbrick.${key}`),
};

export const tokenStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
