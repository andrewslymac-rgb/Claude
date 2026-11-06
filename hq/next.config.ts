import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@blocknote/server-util", "jsdom"],
};

export default nextConfig;
