import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
    /** Large JSON/API bodies when proxy runs; blueprint bytes should not hit Next (client → Storage). */
    proxyClientMaxBodySize: "32mb",
  },
};

export default nextConfig;
