import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents is off: every CareCart page is per-visitor (cookie-based) and rendered at request time.
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
