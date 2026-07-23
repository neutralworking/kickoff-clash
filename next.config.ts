import type { NextConfig } from "next";

// Static export. GitHub Pages serves under the project subpath
// (neutralworking.github.io/kickoff-clash), so it needs basePath/assetPrefix;
// Vercel serves at the domain root, where that prefix makes every /_next asset
// 404 (a blank page). Vercel always sets VERCEL during the build, so detect it
// and serve from root there. An explicit NEXT_PUBLIC_BASE_PATH (including "")
// still wins for any other host.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (process.env.VERCEL ? "" : "/kickoff-clash");

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
