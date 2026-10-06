import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "prune-unused-browsercc-pch",
      generateBundle(_options, bundle) {
        for (const fileName of Object.keys(bundle)) {
          if (fileName.endsWith(".pch")) delete bundle[fileName];
        }
      },
    },
  ],
  optimizeDeps: {
    // browsercc resolves its .wasm and sysroot assets relative to import.meta.url.
    // Pre-bundling changes that URL and makes the development server return its
    // HTML fallback instead of the compiler binary.
    exclude: ["browsercc"],
  },
  worker: {
    format: "es",
  },
});
