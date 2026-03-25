import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import type { ProjectConfig } from "../domain/config.js";

/** Package `assets/templates/<source>` → `<cwd>/docs/<target>` (explicit list; no recursive copy). */
export const BASE_TEMPLATE_DOC_ENTRIES: ReadonlyArray<{
  source: string;
  target: string;
}> = [
  { source: "overview.md", target: "docs/overview.md" },
  { source: "design.md", target: "docs/design.md" },
  { source: "testability/README.md", target: "docs/testability/README.md" },
];

export interface TemplateDocsResult {
  readonly created: readonly string[];
  readonly skipped: readonly string[];
}

export function scaffoldTemplateDocs(
  packageRoot: string,
  cwd: string,
  config?: ProjectConfig,
): TemplateDocsResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const entries = resolveTemplateEntries(config);

  mkdirSync(path.join(cwd, "docs"), { recursive: true });

  for (const entry of entries) {
    const source = path.join(packageRoot, "assets", "templates", entry.source);
    const target = path.join(cwd, entry.target);

    statSync(source);
    mkdirSync(path.dirname(target), { recursive: true });

    if (existsSync(target)) {
      skipped.push(target);
      continue;
    }

    copyFileSync(source, target);
    created.push(target);
  }

  return {
    created,
    skipped,
  };
}

function resolveTemplateEntries(
  config?: ProjectConfig,
): ReadonlyArray<{ source: string; target: string }> {
  const entries = [...BASE_TEMPLATE_DOC_ENTRIES];

  if (!config || config.backlog.provider === "file") {
    entries.splice(2, 0, {
      source: "backlog.md",
      target: config?.backlog.file?.path ?? "docs/backlog.md",
    });
  }

  return entries;
}
