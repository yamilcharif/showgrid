import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
