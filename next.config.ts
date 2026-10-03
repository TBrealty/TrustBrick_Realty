import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
