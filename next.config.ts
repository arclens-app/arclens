import type { NextConfig } from "next"
const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/:path*",
          destination: "/tournament.html",
          has: [{ type: "host", value: "tournament.arclenz.xyz" }],
        },
      ],
    }
  },
}
export default nextConfig