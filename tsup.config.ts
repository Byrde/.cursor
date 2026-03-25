import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: "esm",
    platform: "node",
    target: "node20",
    sourcemap: true,
    dts: true,
    clean: true,
    outDir: "dist",
  },
  {
    entry: { cli: "src/cli.ts" },
    format: "esm",
    platform: "node",
    target: "node20",
    sourcemap: true,
    dts: false,
    clean: false,
    outDir: "dist",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    entry: { "sync-workflow": "src/sync-workflow.ts" },
    format: "esm",
    platform: "node",
    target: "node20",
    sourcemap: true,
    dts: false,
    clean: false,
    outDir: "dist",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
