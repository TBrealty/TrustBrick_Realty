import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, useFonts } from "@expo-google-fonts/geist";
import { InstrumentSerif_400Regular } from "@expo-google-fonts/instrument-serif";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { View, useColorScheme } from "react-native";
import { ApiError } from "@/api/client";
import { SessionProvider } from "@/auth/session";
import { Intro } from "@/components/intro";
import { routeFor } from "@/links";
import { useTappedNotification } from "@/push";
import { fonts, palette } from "@/theme";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Don't retry what won't change: not found, not allowed, signed out.
      retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

/** Opens the screen a tapped push notification points at (also when it launched the app). */
function NotificationTaps() {
  const response = useTappedNotification();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const route = routeFor(response.notification.request.content.data?.link as string | undefined);
    router.push(route ?? "/alerts");
  }, [response]);
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = scheme === "dark" ? palette.dark : palette.light;
  const [loaded] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, InstrumentSerif_400Regular });
  // The opening animation plays once per launch; it hides the system launch screen itself.
  const [intro, setIntro] = useState(true);
  if (!loaded) return null;

  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, primary: c.brick, background: c.background, card: c.background, text: c.text, border: c.line } };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ThemeProvider value={theme}>
          <NotificationTaps />
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 16 },
              headerBackButtonDisplayMode: "minimal",
              headerShadowVisible: false,
              contentStyle: { backgroundColor: c.background },
              animation: "ios_from_right",
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="search" options={{ headerShown: false, animation: "fade_from_bottom" }} />
            <Stack.Screen name="city" options={{ presentation: "formSheet", sheetAllowedDetents: [0.55, 0.9], sheetCornerRadius: 28 }} />
            <Stack.Screen name="listing/[ref]/index" options={{ headerShown: false }} />
            <Stack.Screen name="listing/[ref]/tour" options={{ title: "Virtual tour" }} />
            <Stack.Screen name="listing/[ref]/enquire" options={{ title: "Contact the agent", presentation: "modal" }} />
            <Stack.Screen name="listing/[ref]/book" options={{ title: "Book this stay", presentation: "modal" }} />
            <Stack.Screen name="filters" options={{ presentation: "formSheet", sheetAllowedDetents: [0.85, 1], sheetCornerRadius: 28 }} />
            <Stack.Screen name="sign-in" options={{ title: "Sign in", presentation: "modal" }} />
            <Stack.Screen name="sign-up" options={{ title: "Create an account", presentation: "modal" }} />
            <Stack.Screen name="forgot-password" options={{ title: "Reset your password", presentation: "modal" }} />
            <Stack.Screen name="plans" options={{ title: "Trustbrick Plus" }} />
            <Stack.Screen name="trips/index" options={{ title: "Your stays" }} />
            <Stack.Screen name="trips/[ref]" options={{ title: "Booking" }} />
            <Stack.Screen name="conversation/[ref]" options={{ title: "Messages" }} />
            <Stack.Screen name="(partner)" options={{ headerShown: false }} />
            <Stack.Screen name="workspaces" options={{ title: "Choose a workspace", presentation: "modal" }} />
            <Stack.Screen name="partner/lead/[ref]" options={{ title: "Lead" }} />
            <Stack.Screen name="partner/booking/[ref]" options={{ title: "Booking" }} />
            <Stack.Screen name="partner/conversation/[ref]" options={{ title: "Messages" }} />
            <Stack.Screen name="partner/listing/[ref]" options={{ title: "Listing" }} />
            <Stack.Screen name="partner/tour/[ref]" options={{ title: "Tour preview" }} />
            <Stack.Screen name="partner/capture/[ref]" options={{ headerShown: false, animation: "fade", orientation: "portrait", gestureEnabled: false }} />
            <Stack.Screen name="partner/model-guide" options={{ title: "3D models" }} />
            <Stack.Screen name="partner/property/new" options={{ title: "Onboard a property" }} />
            <Stack.Screen name="partner/property/[ref]/index" options={{ title: "" }} />
            <Stack.Screen name="partner/property/[ref]/[step]" options={{ title: "Edit" }} />
            <Stack.Screen name="partner/property/[ref]/media" options={{ title: "Photos and files" }} />
            <Stack.Screen name="partner/property/[ref]/terms" options={{ title: "Quick edit", presentation: "modal" }} />
            <Stack.Screen name="partner/visits" options={{ title: "Visits" }} />
            <Stack.Screen name="partner/clients" options={{ title: "Clients" }} />
            <Stack.Screen name="partner/calendar" options={{ title: "Calendar" }} />
            <Stack.Screen name="partner/team/index" options={{ title: "Agents" }} />
            <Stack.Screen name="partner/team/[ref]" options={{ title: "Agent" }} />
            <Stack.Screen name="partner/commission" options={{ title: "Commission" }} />
            <Stack.Screen name="partner/subscription" options={{ title: "Subscription" }} />
            <Stack.Screen name="partner/performance" options={{ title: "Performance" }} />
            <Stack.Screen name="security" options={{ title: "Profile & security" }} />
          </Stack>
        </ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
    {intro && <Intro onDone={() => setIntro(false)} />}
    </View>
  );
}
