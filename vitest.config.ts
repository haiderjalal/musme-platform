import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "supabase/tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    // Each Supabase test file starts a PGlite (WASM Postgres) instance. Running files in
    // parallel piles those instances into shared worker processes and exhausts V8's wasm
    // code space ("Commit wasm code space Allocation failed"). Files run one at a time.
    fileParallelism: false,
  },
});
