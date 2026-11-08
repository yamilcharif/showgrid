import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // the round "N" developer button only appears in local development; hide it so the preview looks like the live site
  devIndicators: false,
  // the service worker must always be fresh, or app updates would wait for the old one to expire
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
    ];
  },
  images: {
    // gear photos synced from Rentman
    remotePatterns: [
      new URL("https://s3-eu-west-1.amazonaws.com/rentman-production/**"),
      // photos owners upload on ShowGrid
      new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gear-photos/**`),
    ],
  },
};

export default nextConfig;
