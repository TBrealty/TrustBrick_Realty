import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Where the Trustbrick server is. Set EXPO_PUBLIC_API_URL (e.g. https://trustbrick.in) for a
 * build. In development it defaults to the computer running `expo start`, on the website's
 * port, so a phone on the same Wi-Fi reaches `npm run dev` without any setting.
 */
function defaultOrigin(): string {
  if (Platform.OS === "web") return "http://localhost:3000";
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:3000`;
  return Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";
}

export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL ?? defaultOrigin()).replace(/\/$/, "");
