import { readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_MANIFEST } from "./asset-manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsRoot = path.resolve(__dirname, "..", "..", "assets");

function collectAssetFiles(dir: string, relative = ""): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const rel = relative ? `${relative}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...collectAssetFiles(full, rel));
    } else if (e.isFile()) {
      out.push(rel.split(path.sep).join("/"));
    }
  }
  return out;
}

function sourcePathForRepoRelative(relativeUnderAssets: string): string {
  return `assets/${relativeUnderAssets}`;
}

describe("DEFAULT_MANIFEST", () => {
  it("covers all files under assets/ and is internally consistent", () => {
    expect(DEFAULT_MANIFEST.length).toBeGreaterThan(0);

    const diskFiles = collectAssetFiles(assetsRoot);
    const sourcesOnDisk = new Set(diskFiles.map(sourcePathForRepoRelative));

    for (const rel of diskFiles) {
      const source = sourcePathForRepoRelative(rel);
      expect(
        DEFAULT_MANIFEST.some((e) => e.source === source),
        `missing manifest entry for ${source}`,
      ).toBe(true);
    }

    for (const entry of DEFAULT_MANIFEST) {
      expect(entry.source.startsWith("assets/")).toBe(true);
      const underAssets = entry.source.slice("assets/".length);
      const abs = path.join(assetsRoot, ...underAssets.split("/"));
      expect(existsSync(abs), `source missing on disk: ${entry.source}`).toBe(
        true,
      );
      expect(statSync(abs).isFile(), `source is not a file: ${entry.source}`).toBe(
        true,
      );
    }

    const targets = DEFAULT_MANIFEST.map((e) => e.target);
    expect(new Set(targets).size).toBe(targets.length);

    // No stray manifest entries for files that do not exist
    expect(sourcesOnDisk.size).toBe(DEFAULT_MANIFEST.length);
  });
});
