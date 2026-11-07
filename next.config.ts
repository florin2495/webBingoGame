import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  // Shown next to "Setări". Bump package.json "version" (patch) on every push to main.
  // Served at games.hailatat.icu/classicbingo (hub multi-zone) and <project>.vercel.app/classicbingo.
  basePath: "/classicbingo",
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version, NEXT_PUBLIC_BASE_PATH: "/classicbingo" },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
