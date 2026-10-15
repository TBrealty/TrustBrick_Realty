/**
 * Where the phone's camera points, from its motion sensor, and the directions a 360° photo needs.
 *
 * Angles are degrees. Yaw turns right from "straight ahead" (wherever the agent faced when they
 * started); pitch is up from the horizon. The stitching service (stitcher/) uses the same sense.
 *
 * DeviceMotion.rotation is the W3C device orientation (alpha about Z, beta about X, gamma about Y,
 * applied Z-X'-Y''). The world is X east, Y north, Z up; the phone is x right, y up the screen, z
 * out of the screen, so the back camera looks along -z.
 */

export type Vec = [number, number, number];
export type Mat = [Vec, Vec, Vec];
export type Target = { yaw: number; pitch: number; row: "middle" | "up" | "down" | "zenith" | "nadir" };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * The capture plan: 12 photos around at eye level (every 30°), 8 tilted 45° up and 8 tilted 45°
 * down (every 45°), then straight up and straight down. 30 photos overlap enough to stitch with an
 * ordinary phone camera (about 50° across in portrait).
 */
export const CAPTURE_PLAN: Target[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ yaw: i * 30, pitch: 0, row: "middle" as const })),
  ...Array.from({ length: 8 }, (_, i) => ({ yaw: i * 45, pitch: 45, row: "up" as const })),
  ...Array.from({ length: 8 }, (_, i) => ({ yaw: i * 45, pitch: -45, row: "down" as const })),
  { yaw: 0, pitch: 90, row: "zenith" },
  { yaw: 0, pitch: -90, row: "nadir" },
];

/** The rotation from the phone's frame to the world's, from DeviceMotion.rotation (radians). */
export function rotationMatrix(alpha: number, beta: number, gamma: number): Mat {
  const [ca, sa, cb, sb, cg, sg] = [Math.cos(alpha), Math.sin(alpha), Math.cos(beta), Math.sin(beta), Math.cos(gamma), Math.sin(gamma)];
  // Rz(alpha) · Rx(beta) · Ry(gamma)
  return [
    [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
    [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
    [-cb * sg, sb, cb * cg],
  ];
}

const column = (m: Mat, i: number): Vec => [m[0][i], m[1][i], m[2][i]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Where the back camera points, in the world. */
export const cameraForward = (m: Mat): Vec => {
  const z = column(m, 2);
  return [-z[0], -z[1], -z[2]];
};

/** A direction from yaw and pitch, relative to the world's north (yaw 0) and horizon. */
export function direction(yaw: number, pitch: number): Vec {
  const cp = Math.cos(rad(pitch));
  return [cp * Math.sin(rad(yaw)), cp * Math.cos(rad(yaw)), Math.sin(rad(pitch))];
}

/** The camera's yaw, pitch and roll (how far the picture is turned about the lens), in degrees. */
export function cameraAngles(m: Mat): { yaw: number; pitch: number; roll: number } {
  const f = cameraForward(m);
  const right = column(m, 0);
  const up = column(m, 1);
  return {
    yaw: deg(Math.atan2(f[0], f[1])),
    pitch: deg(Math.asin(Math.max(-1, Math.min(1, f[2])))),
    // 0 when the phone is upright; positive when its right side dips.
    roll: deg(Math.atan2(-right[2], up[2])),
  };
}

/** The angle between two directions, in degrees. */
export const angleBetween = (a: Vec, b: Vec) => deg(Math.acos(Math.max(-1, Math.min(1, dot(a, b)))));

/** Yaw wrapped into -180…180. */
export const wrapYaw = (yaw: number) => ((((yaw + 180) % 360) + 360) % 360) - 180;

/**
 * Where a direction appears on screen, relative to its centre, in pixels (x right, y down), for a
 * camera preview with focal length `focalPx`. Off screen or behind, `onScreen` is false and
 * `angle` says which way to turn (radians, 0 = right, clockwise).
 */
export function project(m: Mat, target: Vec, focalPx: number): { x: number; y: number; onScreen: boolean; angle: number; behind: boolean } {
  // Into the phone's frame: the transpose of the rotation.
  const x = dot(column(m, 0), target);
  const y = dot(column(m, 1), target);
  const z = dot(column(m, 2), target);
  const angle = Math.atan2(-y, x);
  if (z >= -0.05) return { x: 0, y: 0, onScreen: false, angle, behind: true };
  return { x: (focalPx * x) / -z, y: (focalPx * -y) / -z, onScreen: true, angle, behind: false };
}

/** A focal length in pixels from a horizontal field of view across `widthPx`. */
export const focalFor = (hfov: number, widthPx: number) => widthPx / 2 / Math.tan(rad(hfov) / 2);

/**
 * The horizontal field of view of a portrait photo, from its 35 mm-equivalent focal length
 * (EXIF FocalLengthIn35mmFilm). Phones' 4:3 photos have a 34.6 × 26 mm equivalent frame.
 */
export function portraitFov(focal35mm: number | null | undefined): number {
  if (!focal35mm || focal35mm < 10 || focal35mm > 200) return 53; // A typical phone main camera (26 mm).
  return deg(2 * Math.atan(25.96 / (2 * focal35mm)));
}

/** Plain-language directions towards a target, from where the camera points now. */
export function hint(m: Mat, target: Target, baseYaw: number): string {
  const now = cameraAngles(m);
  const dPitch = target.pitch - now.pitch;
  if (target.row === "zenith") return dPitch > 4 ? "Point the phone straight up" : "Almost there";
  if (target.row === "nadir") return dPitch < -4 ? "Point the phone straight down at the floor" : "Almost there";
  const dYaw = wrapYaw(target.yaw + baseYaw - now.yaw);
  if (Math.abs(dYaw) > 8) return dYaw > 0 ? "Turn slowly to your right" : "Turn back to your left";
  if (dPitch > 6) return "Tilt the phone up";
  if (dPitch < -6) return "Tilt the phone down";
  return "Line up the dot in the circle";
}
