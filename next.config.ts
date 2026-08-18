import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Bundle @prisma/client into the server bundle instead of externalizing it.
  // Externalizing lets Turbopack rewrite the import to a virtual package name
  // (@prisma/client-<hash>) that doesn't exist at runtime, 500ing every
  // Prisma-backed API route. Bundling avoids the phantom require entirely.
  serverExternalPackages: [],
};

export default nextConfig;
