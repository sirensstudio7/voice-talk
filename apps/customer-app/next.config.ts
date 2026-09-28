import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@voicetalk/avatar", "@voicetalk/shared"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.r2.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.lorescale.com",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
