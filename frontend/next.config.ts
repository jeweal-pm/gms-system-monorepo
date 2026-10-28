import type { NextConfig } from "next";

// Dev LAN preview (owner 2026-10-28): hosts such as 192.168.0.104 may load dev resources (HMR) via nginx.
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "").split(",").map((host) => host.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
};

export default nextConfig;
