/**
 * Renders workflow templates and copies other assets from `assets/` into
 * `<cwd>/.cursor/` for local dogfooding. Does not update `.managed.json` (use
 * `init` for managed installs).
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AssetEntry } from "./domain/asset-manifest.js";
import { DEFAULT_MANIFEST } from "./domain/asset-manifest.js";
import { createDefaultProjectConfig, normalizeProjectConfig } from "./domain/config.js";
import { loadProjectConfig } from "./infrastructure/project-config-store.js";
import { renderWorkflowMarkdownAsset } from "./infrastructure/workflow-asset-renderer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function packageRootFromScript(): string {
  // `dist/sync-workflow.js` → package root (contains `assets/`)
  return path.resolve(__dirname, "..");
}

function isMarkdownRenderedEntry(
  entry: AssetEntry,
): entry is AssetEntry & { render: NonNullable<AssetEntry["render"]> } {
  return entry.render?.kind === "markdown";
}

function main(): void {
  const cwd = process.cwd();
  const packageRoot = packageRootFromScript();
  const config = normalizeProjectConfig(
    loadProjectConfig(cwd) ?? createDefaultProjectConfig(),
  );

  for (const entry of DEFAULT_MANIFEST) {
    const src = path.join(packageRoot, entry.source);
    const dest = path.join(cwd, ".cursor", entry.target);
    mkdirSync(path.dirname(dest), { recursive: true });
    if (isMarkdownRenderedEntry(entry)) {
      const tpl = readFileSync(src, "utf8");
      writeFileSync(
        dest,
        renderWorkflowMarkdownAsset(tpl, config, entry.render),
        "utf8",
      );
    } else {
      cpSync(src, dest);
    }
  }

  console.log(
    "Synced workflow assets into .cursor/ (markdown assets rendered; other files copied).",
  );
}

main();
