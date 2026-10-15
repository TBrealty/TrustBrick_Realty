import { useColorScheme } from "react-native";

/**
 * Trustbrick's palette, the same values as the website's (app/globals.css), in light and dark.
 * Brick is the accent; ink and paper carry most of the interface.
 */
export const palette = {
  light: {
    background: "#f2eee6",
    surface: "#ffffff",
    paper: "#f8f6f1",
    sand: "#e4ddd0",
    line: "rgba(13, 17, 25, 0.12)",
    ink: "#0d1119",
    text: "#0d1119",
    graphite: "#3b404b",
    muted: "#6b655a",
    faint: "#b8b0a2",
    brick: "#b0502c",
    brickSoft: "rgba(176, 80, 44, 0.10)",
    sage: "#4f7a58",
    sageSoft: "rgba(79, 122, 88, 0.14)",
    amber: "#9a6410",
    amberSoft: "rgba(154, 100, 16, 0.12)",
    slate: "#3d5a80",
    slateSoft: "rgba(61, 90, 128, 0.10)",
    contrast: "#0d1119",
    onContrast: "#f8f6f1",
  },
  dark: {
    background: "#12151b",
    surface: "#1e232c",
    paper: "#191d25",
    sand: "#262c36",
    line: "rgba(243, 241, 236, 0.14)",
    ink: "#f3f1ec",
    text: "#f3f1ec",
    graphite: "#cbd0d8",
    muted: "#a2a9b4",
    faint: "#767d8a",
    brick: "#d2653c",
    brickSoft: "rgba(210, 101, 60, 0.16)",
    sage: "#7fb08a",
    sageSoft: "rgba(127, 176, 138, 0.16)",
    amber: "#d9a13f",
    amberSoft: "rgba(217, 161, 63, 0.16)",
    slate: "#8aa5cc",
    slateSoft: "rgba(138, 165, 204, 0.16)",
    contrast: "#0a0c11",
    onContrast: "#f3f1ec",
  },
} as const;

export type Colors = { [K in keyof typeof palette.light]: string };

export function useColors(): Colors {
  return useColorScheme() === "dark" ? palette.dark : palette.light;
}

/** Instrument Serif for display headings (as on the website), Geist for everything else. */
export const fonts = {
  display: "InstrumentSerif_400Regular",
  body: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
} as const;

export const radius = { sm: 4, md: 8, lg: 14, xl: 20, xxl: 28, pill: 999 } as const;

/** Soft, low shadows for floating surfaces (the tab bar, the search bar, sheets). */
export const shadow = {
  soft: { shadowColor: "#0d1119", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  float: { shadowColor: "#0d1119", shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
} as const;
