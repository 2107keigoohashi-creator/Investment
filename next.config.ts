import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 全画面が認証付き（Cookie を読む）ため、Cache Components は使わず従来の動的レンダリングにする
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
