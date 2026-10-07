/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // wagmi/viem/connectkit ship ESM — no extra transpilation needed on Next 15.
  // Turso client is server-only (lib/turso + app/api/*); never import it in client components.
  webpack: (config) => {
    // Optional native-only deps pulled in by wallet SDKs (MetaMask, WalletConnect).
    // Never executed in the browser; resolving them to `false` silences the
    // "Module not found" build warnings without adding dead dependencies.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    return config;
  },
};

export default nextConfig;
