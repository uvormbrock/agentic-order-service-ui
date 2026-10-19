import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'BACKEND_URL');
  const target = process.env.BACKEND_URL ?? env.BACKEND_URL ?? 'http://127.0.0.1:18080';
  const parsed = new URL(target);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('BACKEND_URL must be a fixed HTTP(S) origin without credentials, path, query or fragment.');
  }
  return {
    server: {
      proxy: {
        '^/orders(?:\\?.*)?$': { target: parsed.origin, changeOrigin: true },
        '^/orders/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:\\?.*)?$': { target: parsed.origin, changeOrigin: true },
        '^/customers(?:\\?.*)?$': { target: parsed.origin, changeOrigin: true },
        '^/customers/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:\\?.*)?$': { target: parsed.origin, changeOrigin: true },
        '^/products(?:\\?.*)?$': { target: parsed.origin, changeOrigin: true },
        '^/products/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:/image(?:/thumbnail)?)?(?:\\?.*)?$': { target: parsed.origin, changeOrigin: true },
      },
    },
  };
});
