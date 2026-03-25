/**
 * Renders agent templates and copies other workflow assets from `assets/` into
 * `<cwd>/.cursor/` for local dogfooding. Does not update `.managed.json` (use
 * `init` for managed installs).
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultProjectConfig, normalizeProjectConfig } from "./domain/config.js";
import type { AssetEntry } from "./domain/asset-manifest.js";
import { DEFAULT_MANIFEST } from "./domain/asset-manifest.js";
import { renderAgentTemplate } from "./infrastructure/agent-template.js";
import { loadProjectConfig } from "./infrastructure/project-config-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function packageRootFromScript(): string {
  // `dist/sync-workflow.js` → package root (contains `assets/`)
  return path.resolve(__dirname, "..");
}

function isRenderedAgentEntry(
  entry: AssetEntry,
): entry is AssetEntry & { renderAgent: NonNullable<AssetEntry["renderAgent"]> } {
  return entry.renderAgent !== undefined;
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
    if (isRenderedAgentEntry(entry)) {
      const tpl = readFileSync(src, "utf8");
      const model = config.workflow.models[entry.renderAgent];
      writeFileSync(dest, renderAgentTemplate(tpl, model), "utf8");
    } else {
      cpSync(src, dest);
    }
  }

  console.log(
    "Synced workflow assets into .cursor/ (agents rendered from templates; other files copied).",
  );
}

main();
