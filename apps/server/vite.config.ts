import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
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
