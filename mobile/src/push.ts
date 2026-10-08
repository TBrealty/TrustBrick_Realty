import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import type * as NotificationsModule from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/api/client";

/**
 * Push notifications. The server pushes every in-app notification to the person's signed-in
 * phones (see lib/services/push.ts); the app only registers its Expo push token after signing in.
 *
 * Not available in the web preview, on simulators, in Expo Go on Android (no remote pushes there
 * since SDK 53), or before the project is linked to EAS (no projectId): registration is skipped
 * quietly and everything else works.
 *
 * expo-notifications is loaded only where pushes work: in Expo Go on Android, merely importing
 * it throws, which would stop the whole app from starting.
 */
const supported = Platform.OS !== "web" && !(Platform.OS === "android" && isRunningInExpoGo());
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications: typeof NotificationsModule | null = supported ? require("expo-notifications") : null;

Notifications?.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

/** The last push notification the person tapped (null where pushes aren't available). */
export const useTappedNotification: () => NotificationsModule.NotificationResponse | null | undefined =
  Notifications?.useLastNotificationResponse ?? (() => null);

let registeredToken: string | null = null;

export async function registerForPush(): Promise<string | null> {
  if (!Notifications || !Device.isDevice) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Trustbrick",
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: "#B0502C",
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api("/devices", {
      method: "POST",
      body: { token, platform: Platform.OS === "ios" ? "ios" : "android", appVersion: Constants.expoConfig?.version },
    });
    registeredToken = token;
    return token;
  } catch {
    return null;
  }
}

/** Before signing out, so the server stops pushing to this phone straight away. */
export async function unregisterPush() {
  if (!registeredToken) return;
  try {
    await api("/devices", { method: "DELETE", body: { token: registeredToken } });
  } catch {}
  registeredToken = null;
}
