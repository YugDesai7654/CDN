/** @type {import('next').NextConfig} */
const nextConfig = {
  optimizeFonts: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
