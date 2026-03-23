import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid bundling pdfjs-dist for the server graph (browser-only via dynamic import).
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
