import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@voicetalk/avatar"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  webpack: (config) => {
    // Preview loads Human from CDN; keep Node TF stubs if anything still resolves them.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@tensorflow/tfjs-node": false,
      "@tensorflow/tfjs-node-gpu": false,
    };
    return config;
  },
};

export default nextConfig;
