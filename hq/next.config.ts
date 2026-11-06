import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@blocknote/server-util", "jsdom", "mammoth", "google-auth-library"],
};

export default nextConfig;
