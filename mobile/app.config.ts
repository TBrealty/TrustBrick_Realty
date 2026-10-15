import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * app.json holds the app's configuration; this adds what only the local test build needs.
 *
 * TRUSTBRICK_LOCAL_RELEASE=1 (set by `npm run phone:update`) builds a release app for the phone on
 * the cable: its code is inside the app, and it reaches the website on the computer at
 * http://localhost:3000 (forwarded over USB). Release builds refuse plain http by default, so
 * this build allows it. Store builds never set the variable and stay https-only.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.TRUSTBRICK_LOCAL_RELEASE !== "1") return config as ExpoConfig;
  return {
    ...(config as ExpoConfig),
    plugins: [...(config.plugins ?? []), ["expo-build-properties", { android: { usesCleartextTraffic: true } }]],
  };
};
