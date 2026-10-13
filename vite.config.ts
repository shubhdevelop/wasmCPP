import { defineConfig } from "vite";

const PREVIEW_SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' blob:; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

export default defineConfig({
  base: "/",
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
    exclude: ["browsercc", "@sqlite.org/sqlite-wasm", "@electric-sql/pglite", "@duckdb/duckdb-wasm"],
  },
  worker: {
    format: "es",
  },
  // Match the Vercel policy in local production previews so WebAssembly/CSP
  // regressions are caught before deployment.
  preview: {
    headers: PREVIEW_SECURITY_HEADERS,
  },
});
