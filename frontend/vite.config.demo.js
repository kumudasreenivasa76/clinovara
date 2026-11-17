import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const d = (f) => path.resolve(__dirname, 'src/demo', f);

/** Builds the browser-only demo: the backend runs in-page via the express shim. */
export default defineConfig({
  plugins: [react()],
  base: './',
  // The bundler freezes process.env, so demo behaviour is switched on at build time.
  define: { 'process.env.CLINOVARA_DEMO': '"1"', 'process.env.CLINOVARA_AI': '"rules"' },
  resolve: {
    alias: [
      { find: /^express$/, replacement: d('express-shim.js') },
      { find: /^node:crypto$/, replacement: d('shim-crypto.js') },
      { find: /^node:fs$/, replacement: d('shim-fs.js') },
      { find: /^node:path$/, replacement: d('shim-path.js') },
      { find: /^node:url$/, replacement: d('shim-url.js') },
    ],
  },
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    rollupOptions: { input: path.resolve(__dirname, 'demo.html'), external: ['@anthropic-ai/sdk'], output: { inlineDynamicImports: true } },
  },
  server: { fs: { allow: ['..'] } },
});
