import type { NextConfig } from "next";

// Static export for GitHub Pages. The GitHub Actions runner has internet, so
// next/font/google self-hosts the fonts at build time (no offline swap needed there).
// basePath targets the project page (neutralworking.github.io/kickoff-clash); set
// NEXT_PUBLIC_BASE_PATH="" when serving from a custom domain root (e.g. chief-scout.com).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/kickoff-clash";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
