import { ownedEngineBuild } from "./scripts/owned-engine-build.ts";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Isolated migration gate. The production application is deliberately separate.
export default defineConfig({
  root: "tests/engine-pilot",
  plugins: [react(), ownedEngineBuild()],
  base: "./",
  define: { "process.env.IS_PREACT": "false" },
  server: { host: "127.0.0.1", port: 1421, strictPort: true },
  build: { outDir: "../../dist/engine-pilot", emptyOutDir: true, target: "es2022" },
});
