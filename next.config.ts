import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Erzeugt beim Build einen eigenständigen Server-Ordner (.next/standalone),
  // der ohne node_modules auskommt - das macht das Docker-Image klein.
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
