import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / binary packages must not be bundled.
  serverExternalPackages: ["better-sqlite3", "ffmpeg-static", "archiver", "mammoth", "adm-zip", "ws"],
};

export default nextConfig;
