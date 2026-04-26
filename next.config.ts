import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these as real Node modules instead of bundling them into the
  // Turbopack server output. Reasons:
  //   - canvas: native bindings, can't be bundled.
  //   - pdfjs-dist: lib/pdf/raster.ts uses createRequire(import.meta.url)
  //     to locate the package's standard_fonts/ + cmaps/ directories at
  //     runtime; bundling intercepts require.resolve and returns a
  //     numeric module ID instead of a filesystem path, breaking the
  //     font resolution.
  //   - path2d: pulled in only by raster.ts as a Path2D polyfill; ride
  //     along to keep the rasterizer's deps in the same bucket.
  serverExternalPackages: ["canvas", "pdfjs-dist", "path2d"],
};

export default nextConfig;
