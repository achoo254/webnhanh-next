import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { REPO_ROOT_PATH, trangHead } from './vite-trang.ts';

// The API server listens on 127.0.0.1:5296 in dev; the web dev server proxies to it so cookies stay same-origin.
const API = 'http://127.0.0.1:5296';

export default defineConfig({
  plugins: [react(), ...trangHead()],
  server: {
    host: '127.0.0.1',
    fs: { allow: [REPO_ROOT_PATH] },
    proxy: { '/api': API, '/auth': API, '/healthz': API },
  },
  preview: { host: '127.0.0.1', proxy: { '/api': API, '/auth': API, '/healthz': API } },
  build: { target: 'es2022', sourcemap: true },
});
