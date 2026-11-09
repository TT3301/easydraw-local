import { ownedEngineBuild } from "./scripts/owned-engine-build.ts";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Read-only share viewer, served by apps/share-server at /s/<id>. Absolute base: pages live under /s/.
export default defineConfig({
  plugins: [react(), ownedEngineBuild()],
  define: { "process.env.IS_PREACT": "false" },
  base: "/",
  clearScreen: false,
  build: {
    outDir: "dist-viewer",
    emptyOutDir: true,
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: { input: "viewer.html" },
  },
});
