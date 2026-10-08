import type { NextConfig } from "next";

/**
 * The mobile app's API is called from native code, which needs no CORS. Only the app's web
 * preview (Expo on :8081) runs in a browser, so in development the API allows that origin.
 * Set API_CORS_ORIGIN to change it; production allows none unless it's set.
 */
const apiCorsOrigin = process.env.API_CORS_ORIGIN ?? (process.env.NODE_ENV === "production" ? undefined : "http://localhost:8081");
const corsHeaders = apiCorsOrigin
  ? [
      { key: "Access-Control-Allow-Origin", value: apiCorsOrigin },
      { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
      { key: "Access-Control-Allow-Headers", value: "authorization, content-type, x-trustbrick-workspace" },
      { key: "Access-Control-Max-Age", value: "600" },
      { key: "Vary", value: "Origin" },
    ]
  : [];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return corsHeaders.length
      ? [
          { source: "/api/v1/:path*", headers: corsHeaders },
          { source: "/media/:path*", headers: corsHeaders },
        ]
      : [];
  },
  // The review queue was renamed Approvals; old links (including stored notifications) still work.
  async redirects() {
    return [
      { source: "/moderation", destination: "/approvals", permanent: true },
      { source: "/moderation/:ref", destination: "/approvals/:ref", permanent: true },
    ];
  },
  experimental: {
    // forbidden() renders app/forbidden.tsx for signed-in users who lack a permission.
    authInterrupts: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [70, 80],
    deviceSizes: [390, 640, 828, 1080, 1280, 1600, 1920, 2560],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
