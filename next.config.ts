import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig