import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@voicetalk/ui", "@voicetalk/api-client", "@voicetalk/avatar"],
};

export default nextConfig;
