/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // wagmi/viem/connectkit ship ESM — no extra transpilation needed on Next 15.
  // Turso client is server-only (lib/turso + app/api/*); never import it in client components.
  webpack: (config) => {
    // Fix for viem/wagmi optional React Native deps that warn under webpack.
    config.resolve.fallback = { ...config.resolve.fallback };
    return config;
  },
};

export default nextConfig;
