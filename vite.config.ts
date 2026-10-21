import { ownedEngineBuild } from "./scripts/owned-engine-build.ts";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), ownedEngineBuild()],
  define: { "process.env.IS_PREACT": "false" },

  base: "./",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      ignored: ["**/electron/**", "**/release/**"],
    },
  },
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: true,
  },
});
