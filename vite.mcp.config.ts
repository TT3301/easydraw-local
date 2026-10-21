import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  clearScreen: false,
  resolve: {
    conditions: ["node"],
  },
  ssr: {
    noExternal: true,
    target: "node",
  },
  build: {
    target: "node20",
    outDir: "dist-mcp",
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    ssr: "packages/mcp-server/src/index.ts",
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((name) => `node:${name}`),
      ],
      output: {
        format: "cjs",
        entryFileNames: "mcp-server.cjs",
      },
    },
  },
});
