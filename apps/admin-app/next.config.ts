import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@voicetalk/avatar"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
