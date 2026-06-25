import type { NextConfig } from "next";

// Static export. The build host (Vercel / GitHub Actions) has internet, so
// next/font/google self-hosts the fonts at build time (no offline swap needed there).
// Defaults to a ROOT basePath so a custom-domain host (Vercel → chief-scout.com) serves
// the app at "/". The GitHub Pages workflow sets NEXT_PUBLIC_BASE_PATH="/kickoff-clash"
// explicitly for the project-page URL (neutralworking.github.io/kickoff-clash).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
