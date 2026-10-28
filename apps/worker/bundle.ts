// Production bundle: one ESM file. Migrations and the template's sample photos are found through their packages at
// run time, so the release keeps the workspace's node_modules (pnpm install --prod on the server).
import { build } from 'esbuild';

await build({
  entryPoints: { main: 'src/main.ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  // PGlite is dev/test only and loaded on demand; pg-native is an optional driver pg never needs here.
  external: ['@electric-sql/pglite', 'drizzle-orm/pglite', 'drizzle-orm/pglite/migrator', 'pg-native'],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  sourcemap: true,
  logLevel: 'info',
});
