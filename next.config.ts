import type { NextConfig } from "next";

// Static export for GitHub Pages. The Actions runner has internet, so
// next/font/google self-hosts the fonts at build time (no offline swap needed there).
// Defaults to the project-page basePath (neutralworking.github.io/kickoff-clash); set
// NEXT_PUBLIC_BASE_PATH="" to serve from a domain root instead.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/kickoff-clash";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
