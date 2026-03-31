import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  eslint: {
    // Don't fail the build on ESLint errors — warnings only
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow production builds to complete even with type errors
    ignoreBuildErrors: true,
  },
}

export default nextConfig