import type { NextConfig } from "next";

const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "").split(",").map((host) => host.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  experimental: {
    // `next upgrade --agent=security` (16.4.1 → 16.4.6, GHSA-mfr8-8qww-v76h): agent upgrades take security releases.
    agentUpgrade: "security",
  },
};

export default nextConfig;
