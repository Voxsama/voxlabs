import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / binary packages must not be bundled.
  serverExternalPackages: ["better-sqlite3", "@ffmpeg-installer/ffmpeg", "archiver", "mammoth", "adm-zip", "ws"],
};

export default nextConfig;
