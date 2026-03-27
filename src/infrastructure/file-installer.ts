import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { AssetEntry } from "../domain/asset-manifest.js";
import {
  createDefaultProjectConfig,
  normalizeProjectConfig,
  type ProjectConfig,
} from "../domain/config.js";
import {
  hashFileContents,
  type ManagedFileRecord,
  type ManagedState,
} from "../domain/managed-state.js";
import { renderWorkflowMarkdownAsset } from "./workflow-asset-renderer.js";
import {
  loadManagedState,
  saveManagedStateAtomic,
} from "./managed-state-store.js";

export interface InstallOptions {
  readonly force: boolean;
  readonly packageVersion: string;
  /** Used to render markdown workflow templates; defaults match shipped presets. */
  readonly projectConfig?: ProjectConfig;
}

function resolveManifestSourceBytes(
  entry: AssetEntry,
  packageRoot: string,
  projectConfig: ProjectConfig,
): Buffer {
  const absSource = path.join(packageRoot, entry.source);
  const raw = readFileSync(absSource);
  if (!entry.render || entry.render.kind !== "markdown") {
    return raw;
  }
  const utf8 = raw.toString("utf8");
  const rendered = renderWorkflowMarkdownAsset(utf8, projectConfig, entry.render);
  return Buffer.from(rendered, "utf8");
}

export type ManifestFileOutcome =
  | {
      kind: "installed";
      target: string;
      source: string;
      absolutePath: string;
      hash: string;
    }
  | {
      kind: "updated";
      target: string;
      source: string;
      absolutePath: string;
      hash: string;
      forced: boolean;
    }
  | {
      kind: "adopted";
      target: string;
      source: string;
      absolutePath: string;
      hash: string;
    }
  | {
      kind: "recreated";
      target: string;
      source: string;
      absolutePath: string;
      hash: string;
    }
  | {
      kind: "skipped";
      target: string;
      source: string;
      absolutePath: string;
      reason: "tracked_hash_mismatch" | "untracked_bytes_mismatch";
      forced: false;
    };

export type StaleOutcome =
  | { kind: "stale_removed"; target: string; absolutePath: string }
  | { kind: "stale_record_dropped"; target: string }
  | {
      kind: "stale_kept_warn";
      target: string;
      absolutePath: string;
      reason: "content_mismatch";
    };

export interface InstallReconcileResult {
  readonly manifestOutcomes: readonly ManifestFileOutcome[];
  readonly staleOutcomes: readonly StaleOutcome[];
  readonly warnings: readonly string[];
}

function nowRecord(
  hash: string,
  packageVersion: string,
): ManagedFileRecord {
  return {
    hash,
    version: packageVersion,
    installedAt: new Date().toISOString(),
  };
}

/**
 * Reconciles manifest entries against disk and `.cursor/.managed.json`:
 * copies, adopts, skips conflicts, and cleans stale managed files.
 */
export function installAssets(
  manifest: readonly AssetEntry[],
  packageRoot: string,
  targetDir: string,
  options: InstallOptions,
): InstallReconcileResult {
  const resolvedRoot = path.resolve(packageRoot);
  const resolvedTargetBase = path.resolve(targetDir);
  const projectConfig = normalizeProjectConfig(
    options.projectConfig ?? createDefaultProjectConfig(),
  );
  const initialState = loadManagedState(resolvedTargetBase);
  const workingFiles: Record<string, ManagedFileRecord> = {
    ...(initialState?.files ?? {}),
  };

  const manifestOutcomes: ManifestFileOutcome[] = [];
  const staleOutcomes: StaleOutcome[] = [];
  const warnings: string[] = [];

  const manifestTargets = new Set(manifest.map((e) => e.target));

  for (const entry of manifest) {
    const absSource = path.join(resolvedRoot, entry.source);
    const absTarget = path.join(resolvedTargetBase, entry.target);

    statSync(absSource);
    const sourceBytes = resolveManifestSourceBytes(
      entry,
      resolvedRoot,
      projectConfig,
    );
    const sourceHash = hashFileContents(sourceBytes);

    const record = workingFiles[entry.target];

    if (!existsSync(absTarget)) {
      mkdirSync(path.dirname(absTarget), { recursive: true });
      writeFileSync(absTarget, sourceBytes);
      const writtenHash = hashFileContents(readFileSync(absTarget));
      workingFiles[entry.target] = nowRecord(
        writtenHash,
        options.packageVersion,
      );

      if (record) {
        manifestOutcomes.push({
          kind: "recreated",
          target: entry.target,
          source: entry.source,
          absolutePath: absTarget,
          hash: writtenHash,
        });
      } else {
        manifestOutcomes.push({
          kind: "installed",
          target: entry.target,
          source: entry.source,
          absolutePath: absTarget,
          hash: writtenHash,
        });
      }
      continue;
    }

    const diskBytes = readFileSync(absTarget);
    const diskHash = hashFileContents(diskBytes);

    if (record) {
      if (diskHash === record.hash) {
        writeFileSync(absTarget, sourceBytes);
        const newHash = hashFileContents(readFileSync(absTarget));
        workingFiles[entry.target] = nowRecord(newHash, options.packageVersion);
        manifestOutcomes.push({
          kind: "updated",
          target: entry.target,
          source: entry.source,
          absolutePath: absTarget,
          hash: newHash,
          forced: false,
        });
      } else if (!options.force) {
        const msg = `Skipped managed file (modified on disk): ${entry.target}`;
        warnings.push(msg);
        if (entry.render?.kind === "markdown" && entry.render.agentRole) {
          const desiredHash = sourceHash;
          if (desiredHash !== record.hash) {
            warnings.push(
              `Model or template update not applied to ${entry.target} because the file was modified locally. ` +
                `Update the \`model:\` line yourself, or re-run init with --force to replace managed files.`,
            );
          }
        }
        manifestOutcomes.push({
          kind: "skipped",
          target: entry.target,
          source: entry.source,
          absolutePath: absTarget,
          reason: "tracked_hash_mismatch",
          forced: false,
        });
      } else {
        writeFileSync(absTarget, sourceBytes);
        const newHash = hashFileContents(readFileSync(absTarget));
        workingFiles[entry.target] = nowRecord(newHash, options.packageVersion);
        warnings.push(
          `Overwrote modified managed file (--force): ${entry.target}`,
        );
        manifestOutcomes.push({
          kind: "updated",
          target: entry.target,
          source: entry.source,
          absolutePath: absTarget,
          hash: newHash,
          forced: true,
        });
      }
      continue;
    }

    if (diskHash === sourceHash) {
      workingFiles[entry.target] = nowRecord(diskHash, options.packageVersion);
      manifestOutcomes.push({
        kind: "adopted",
        target: entry.target,
        source: entry.source,
        absolutePath: absTarget,
        hash: diskHash,
      });
      continue;
    }

    if (!options.force) {
      const msg = `Skipped untracked file (differs from package): ${entry.target}`;
      warnings.push(msg);
      manifestOutcomes.push({
        kind: "skipped",
        target: entry.target,
        source: entry.source,
        absolutePath: absTarget,
        reason: "untracked_bytes_mismatch",
        forced: false,
      });
      continue;
    }

    writeFileSync(absTarget, sourceBytes);
    const newHash = hashFileContents(readFileSync(absTarget));
    workingFiles[entry.target] = nowRecord(newHash, options.packageVersion);
    warnings.push(
      `Overwrote untracked file that differed from package (--force): ${entry.target}`,
    );
    manifestOutcomes.push({
      kind: "updated",
      target: entry.target,
      source: entry.source,
      absolutePath: absTarget,
      hash: newHash,
      forced: true,
    });
  }

  const initialKeys = Object.keys(initialState?.files ?? {});
  for (const target of initialKeys) {
    if (manifestTargets.has(target)) {
      continue;
    }

    const record = workingFiles[target];
    if (!record) {
      continue;
    }

    const absStale = path.join(resolvedTargetBase, target);

    if (!existsSync(absStale)) {
      delete workingFiles[target];
      staleOutcomes.push({ kind: "stale_record_dropped", target });
      continue;
    }

    const diskHash = hashFileContents(readFileSync(absStale));
    if (diskHash === record.hash) {
      unlinkSync(absStale);
      delete workingFiles[target];
      staleOutcomes.push({
        kind: "stale_removed",
        target,
        absolutePath: absStale,
      });
    } else {
      const msg = `Stale managed file not in manifest; keeping local changes: ${target}`;
      warnings.push(msg);
      staleOutcomes.push({
        kind: "stale_kept_warn",
        target,
        absolutePath: absStale,
        reason: "content_mismatch",
      });
    }
  }

  const finalState: ManagedState = {
    version: options.packageVersion,
    installedAt: new Date().toISOString(),
    files: workingFiles,
  };
  saveManagedStateAtomic(resolvedTargetBase, finalState);

  return {
    manifestOutcomes,
    staleOutcomes,
    warnings,
  };
}
