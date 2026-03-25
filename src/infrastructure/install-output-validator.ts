import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type { ManifestFileOutcome } from "./file-installer.js";

const PACKAGE_OWNED_KINDS = new Set<
  ManifestFileOutcome["kind"]
>(["installed", "updated", "adopted", "recreated"]);

function displayPath(cwd: string, absolutePath: string): string {
  const rel = path.relative(cwd, absolutePath);
  return rel.split(path.sep).join("/");
}

/** Returns a human-readable failure reason, or `null` if the path is valid. */
function failureReason(absolutePath: string): string | null {
  if (!existsSync(absolutePath)) {
    return "missing";
  }
  const st = statSync(absolutePath);
  if (!st.isFile()) {
    return "not a regular file";
  }
  if (st.size === 0) {
    return "empty file";
  }
  return null;
}

/**
 * Confirms every manifest outcome that should have produced a package-owned file
 * under `<cwd>/.cursor/` exists as a non-empty regular file.
 * Does not validate `skipped` outcomes (conflict handling).
 */
export function validateInstalledPackageOutputs(
  cwd: string,
  outcomes: readonly ManifestFileOutcome[],
): void {
  const resolvedCwd = path.resolve(cwd);
  const failures: string[] = [];

  for (const o of outcomes) {
    if (!PACKAGE_OWNED_KINDS.has(o.kind)) {
      continue;
    }
    const reason = failureReason(o.absolutePath);
    if (reason !== null) {
      failures.push(`${displayPath(resolvedCwd, o.absolutePath)} (${reason})`);
    }
  }

  if (failures.length > 0) {
    const msg = `Post-install validation failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`;
    throw new Error(msg);
  }
}
