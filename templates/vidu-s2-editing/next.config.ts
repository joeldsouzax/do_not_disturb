import type { NextConfig } from "next";

// The reference library and the sample clip live on Reactor's public CDN.
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "inc-reactor-static.b-cdn.net" },
    ],
  },
};

export default nextConfig;
