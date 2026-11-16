/** Static export used only for the Vercel upload (no server routes). */
export default {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, '@react-native-async-storage/async-storage': false, 'pino-pretty': false };
    return config;
  },
};
