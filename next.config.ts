import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure static export: no server runtime, no API routes, nowhere for an
  // analysed email to be sent. `next build` emits the site into `out/`.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
