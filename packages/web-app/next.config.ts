import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Use the compiled version to avoid internal alias conflicts
    config.resolve.alias = {
      ...config.resolve.alias,
      "@core": path.resolve(__dirname, "../core/dist"),
      "@windmill": path.resolve(__dirname, "../windmill-service/dist"),
    };

    return config;
  },
};

export default nextConfig;
