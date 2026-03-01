import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
  build: {
    ssr: resolve(__dirname, "src/start.ts"),
    outDir: "dist",
    emptyOutDir: true,
    target: "node20",
    sourcemap: true,
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: "start.js",
        format: "es",
      },
    },
  },
});
