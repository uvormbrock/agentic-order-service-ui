import { defineConfig } from 'vite';

// Deliberately independent of the development config: no backend target or proxy.
export default defineConfig({
  server: { host: '127.0.0.1', port: 4177, strictPort: true },
});
