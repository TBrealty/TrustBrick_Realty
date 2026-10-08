import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { registerDevice, unregisterDevice } from "@/lib/services/push";

/** Registers this phone for push notifications (an Expo push token). Call after every sign-in. */
export const POST = apiRoute("v1.devices.register", { auth: "user" }, async ({ request, person }) => {
  const body = await readJson(request, z.unknown());
  await registerDevice(person!.userId, person!.sessionId, body);
  return created({ registered: true });
});

/** Stops push notifications to this phone. */
export const DELETE = apiRoute("v1.devices.unregister", { auth: "user" }, async ({ request, person }) => {
  const { token } = await readJson(request, z.object({ token: z.string().min(1).max(300) }));
  await unregisterDevice(person!.userId, token);
  return { registered: false };
});
