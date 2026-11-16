import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { guidePages } from './vite-guide-pages.ts';
import { REPO_ROOT_PATH, brandHead } from './vite-head.ts';
import { previewFonts } from './vite-preview-fonts.ts';

// The API server listens on 127.0.0.1:5296 in dev; the web dev server proxies to it so cookies stay same-origin.
const API = 'http://127.0.0.1:5296';

export default defineConfig({
  plugins: [react(), ...brandHead(), previewFonts(), guidePages()],
  server: {
    host: '127.0.0.1',
    fs: { allow: [REPO_ROOT_PATH] },
    proxy: { '/api': API, '/auth': API, '/healthz': API },
  },
  preview: { host: '127.0.0.1', proxy: { '/api': API, '/auth': API, '/healthz': API } },
  build: {
    target: 'es2022',
    sourcemap: true,
    // React and the router in a chunk of their own: they change only with a dependency update, so browsers keep them
    // cached across releases of the app, and the app's own entry stays small. The index.html checks still hold: a
    // module chunk loaded by the entry, no inline script.
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'react', test: /node_modules[\\/](?:\.pnpm[\\/])?(?:react|react-dom|react-router|scheduler|cookie|set-cookie-parser)(?:@[^\\/]+)?[\\/]/ }] },
      },
    },
  },
});
