import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultProjectConfig } from "../domain/config.js";
import type { AssetEntry } from "../domain/asset-manifest.js";
import { hashFileContents } from "../domain/managed-state.js";
import { installAssets } from "./file-installer.js";
import { loadManagedState, saveManagedStateAtomic } from "./managed-state-store.js";

const pkgVersion = "9.9.9-test";

function opts(force = false) {
  return { force, packageVersion: pkgVersion };
}

function optsWithConfig(
  force: boolean,
  projectConfig: ReturnType<typeof createDefaultProjectConfig>,
) {
  return { force, packageVersion: pkgVersion, projectConfig };
}

describe("installAssets", () => {
  it("copies manifest entries, creates parent dirs, and records managed state", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    const rulesDir = join(pkg, "assets", "rules");
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, "global.mdc"), "rule content\n", "utf8");
    writeFileSync(join(pkg, "root.txt"), "deep file", "utf8");

    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    const manifest: AssetEntry[] = [
      { source: "assets/rules/global.mdc", target: "rules/global.mdc" },
      { source: "root.txt", target: "deep/nested/file.txt" },
    ];

    const result = installAssets(manifest, pkg, destBase, opts());

    const installedRule = join(destBase, "rules", "global.mdc");
    const installedDeep = join(destBase, "deep", "nested", "file.txt");
    expect(readFileSync(installedRule, "utf8")).toBe("rule content\n");
    expect(readFileSync(installedDeep, "utf8")).toBe("deep file");

    expect(result.manifestOutcomes).toHaveLength(2);
    expect(result.manifestOutcomes.every((o) => o.kind === "installed")).toBe(
      true,
    );
    expect(result.warnings).toHaveLength(0);

    const state = loadManagedState(destBase);
    expect(state).not.toBeNull();
    expect(state!.version).toBe(pkgVersion);
    expect(state!.files["rules/global.mdc"]?.hash).toBe(
      hashFileContents(Buffer.from("rule content\n", "utf8")),
    );
  });

  it("throws when a source file is missing", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    const manifest: AssetEntry[] = [
      { source: "missing.txt", target: "out.txt" },
    ];

    expect(() => installAssets(manifest, pkg, destBase, opts())).toThrow();
  });

  it("throws when managed state JSON is invalid", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    writeFileSync(join(pkg, "a.txt"), "a", "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    mkdirSync(destBase, { recursive: true });
    writeFileSync(join(destBase, ".managed.json"), "{ not json", "utf8");

    expect(() =>
      installAssets([{ source: "a.txt", target: "out.txt" }], pkg, destBase, opts()),
    ).toThrow(/Invalid managed state JSON/);
  });

  it("tracked file with matching hash is updated from package", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    writeFileSync(join(pkg, "f.txt"), "v2\n", "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    mkdirSync(destBase, { recursive: true });
    const target = join(destBase, "out.txt");
    writeFileSync(target, "v1\n", "utf8");
    const h1 = hashFileContents(Buffer.from("v1\n", "utf8"));
    saveManagedStateAtomic(destBase, {
      version: "1.0.0",
      files: {
        "out.txt": { hash: h1, version: "1.0.0" },
      },
    });

    const r = installAssets(
      [{ source: "f.txt", target: "out.txt" }],
      pkg,
      destBase,
      opts(),
    );

    expect(readFileSync(target, "utf8")).toBe("v2\n");
    expect(r.manifestOutcomes[0]?.kind).toBe("updated");
    expect(
      (r.manifestOutcomes[0] as { forced?: boolean }).forced,
    ).toBe(false);
  });

  it("tracked file with differing hash is skipped unless force", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    writeFileSync(join(pkg, "f.txt"), "from pkg\n", "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    mkdirSync(destBase, { recursive: true });
    const target = join(destBase, "out.txt");
    writeFileSync(target, "user edit\n", "utf8");
    saveManagedStateAtomic(destBase, {
      version: "1.0.0",
      files: {
        "out.txt": {
          hash: hashFileContents(Buffer.from("old managed\n", "utf8")),
          version: "1.0.0",
        },
      },
    });

    const r = installAssets(
      [{ source: "f.txt", target: "out.txt" }],
      pkg,
      destBase,
      opts(false),
    );

    expect(readFileSync(target, "utf8")).toBe("user edit\n");
    expect(r.manifestOutcomes[0]).toMatchObject({
      kind: "skipped",
      reason: "tracked_hash_mismatch",
    });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("tracked file with differing hash is overwritten with force", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    writeFileSync(join(pkg, "f.txt"), "from pkg\n", "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    mkdirSync(destBase, { recursive: true });
    const target = join(destBase, "out.txt");
    writeFileSync(target, "user edit\n", "utf8");
    saveManagedStateAtomic(destBase, {
      version: "1.0.0",
      files: {
        "out.txt": {
          hash: hashFileContents(Buffer.from("old managed\n", "utf8")),
          version: "1.0.0",
        },
      },
    });

    const r = installAssets(
      [{ source: "f.txt", target: "out.txt" }],
      pkg,
      destBase,
      opts(true),
    );

    expect(readFileSync(target, "utf8")).toBe("from pkg\n");
    expect(r.manifestOutcomes[0]?.kind).toBe("updated");
    expect((r.manifestOutcomes[0] as { forced: boolean }).forced).toBe(true);
  });

  it("untracked file matching package bytes is adopted without rewrite", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    const body = "same-bytes\n";
    writeFileSync(join(pkg, "f.txt"), body, "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    mkdirSync(destBase, { recursive: true });
    const target = join(destBase, "out.txt");
    writeFileSync(target, body, "utf8");

    const r = installAssets(
      [{ source: "f.txt", target: "out.txt" }],
      pkg,
      destBase,
      opts(),
    );

    expect(r.manifestOutcomes[0]?.kind).toBe("adopted");
    const state = loadManagedState(destBase);
    expect(state?.files["out.txt"]?.hash).toBe(
      hashFileContents(Buffer.from(body, "utf8")),
    );
  });

  it("untracked file with differing bytes is skipped unless force", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    writeFileSync(join(pkg, "f.txt"), "pkg\n", "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    mkdirSync(destBase, { recursive: true });
    const target = join(destBase, "out.txt");
    writeFileSync(target, "local\n", "utf8");

    const r = installAssets(
      [{ source: "f.txt", target: "out.txt" }],
      pkg,
      destBase,
      opts(false),
    );

    expect(readFileSync(target, "utf8")).toBe("local\n");
    expect(r.manifestOutcomes[0]).toMatchObject({
      kind: "skipped",
      reason: "untracked_bytes_mismatch",
    });
  });

  it("recreates a tracked manifest file that is missing on disk", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    writeFileSync(join(pkg, "f.txt"), "restored\n", "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    saveManagedStateAtomic(destBase, {
      version: "1.0.0",
      files: {
        "out.txt": {
          hash: hashFileContents(Buffer.from("x", "utf8")),
          version: "1.0.0",
        },
      },
    });

    const r = installAssets(
      [{ source: "f.txt", target: "out.txt" }],
      pkg,
      destBase,
      opts(),
    );

    const target = join(destBase, "out.txt");
    expect(readFileSync(target, "utf8")).toBe("restored\n");
    expect(r.manifestOutcomes[0]?.kind).toBe("recreated");
  });

  it("removes stale managed files when disk hash matches stored hash", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    writeFileSync(join(pkg, "only.txt"), "only\n", "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    mkdirSync(join(destBase, "rules"), { recursive: true });
    const stalePath = join(destBase, "rules", "gone.mdc");
    const staleBody = "stale\n";
    writeFileSync(stalePath, staleBody, "utf8");
    const staleHash = hashFileContents(Buffer.from(staleBody, "utf8"));
    saveManagedStateAtomic(destBase, {
      version: "1.0.0",
      files: {
        "rules/gone.mdc": { hash: staleHash, version: "1.0.0" },
      },
    });

    const r = installAssets(
      [{ source: "only.txt", target: "only.txt" }],
      pkg,
      destBase,
      opts(),
    );

    expect(existsSync(stalePath)).toBe(false);
    expect(r.staleOutcomes.some((s) => s.kind === "stale_removed")).toBe(true);
    const state = loadManagedState(destBase);
    expect(state?.files["rules/gone.mdc"]).toBeUndefined();
  });

  it("warns and keeps stale file when disk hash differs from stored hash", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    writeFileSync(join(pkg, "only.txt"), "only\n", "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    mkdirSync(join(destBase, "rules"), { recursive: true });
    const stalePath = join(destBase, "rules", "gone.mdc");
    writeFileSync(stalePath, "user changed\n", "utf8");
    saveManagedStateAtomic(destBase, {
      version: "1.0.0",
      files: {
        "rules/gone.mdc": {
          hash: hashFileContents(Buffer.from("stale\n", "utf8")),
          version: "1.0.0",
        },
      },
    });

    const r = installAssets(
      [{ source: "only.txt", target: "only.txt" }],
      pkg,
      destBase,
      opts(),
    );

    expect(existsSync(stalePath)).toBe(true);
    expect(r.staleOutcomes.some((s) => s.kind === "stale_kept_warn")).toBe(
      true,
    );
    expect(r.warnings.some((w) => w.includes("Stale managed"))).toBe(true);
  });

  it("renders agent templates from projectConfig.models", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    const tpl = "---\nmodel: {{MODEL}}\n---\n";
    writeFileSync(join(pkg, "a.md"), tpl, "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    const base = createDefaultProjectConfig();
    const projectConfig = {
      ...base,
      workflow: {
        ...base.workflow,
        models: {
          ...base.workflow.models,
          planner: "custom-planner-model",
        },
      },
    };
    const r = installAssets(
      [
        {
          source: "a.md",
          target: "agents/planner.md",
          renderAgent: "planner",
        },
      ],
      pkg,
      destBase,
      optsWithConfig(false, projectConfig),
    );

    const out = readFileSync(join(destBase, "agents/planner.md"), "utf8");
    expect(out).toContain("model: custom-planner-model");
    expect(r.manifestOutcomes[0]?.kind).toBe("installed");
  });

  it("warns when a skipped rendered agent would change model output", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    const tpl = "---\nmodel: {{MODEL}}\n---\n";
    writeFileSync(join(pkg, "a.md"), tpl, "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    const target = join(destBase, "agents/x.md");
    mkdirSync(join(destBase, "agents"), { recursive: true });
    writeFileSync(target, "user edit\n", "utf8");
    const oldRendered = tpl.replace("{{MODEL}}", "old-planner");
    saveManagedStateAtomic(destBase, {
      version: "1.0.0",
      files: {
        "agents/x.md": {
          hash: hashFileContents(Buffer.from(oldRendered, "utf8")),
          version: "1.0.0",
        },
      },
    });
    const base = createDefaultProjectConfig();
    const projectConfig = {
      ...base,
      workflow: {
        ...base.workflow,
        models: {
          ...base.workflow.models,
          planner: "new-planner",
        },
      },
    };

    const r = installAssets(
      [{ source: "a.md", target: "agents/x.md", renderAgent: "planner" }],
      pkg,
      destBase,
      optsWithConfig(false, projectConfig),
    );

    expect(readFileSync(target, "utf8")).toBe("user edit\n");
    expect(r.manifestOutcomes[0]?.kind).toBe("skipped");
    expect(
      r.warnings.some((w) => w.includes("Model or template update not applied")),
    ).toBe(true);
  });

  it("drops stale record when the file is already absent", () => {
    const pkg = mkdtempSync(join(tmpdir(), "byrde-pkg-"));
    writeFileSync(join(pkg, "only.txt"), "only\n", "utf8");
    const destBase = mkdtempSync(join(tmpdir(), "byrde-dest-"));
    saveManagedStateAtomic(destBase, {
      version: "1.0.0",
      files: {
        "rules/missing.mdc": {
          hash: hashFileContents(Buffer.from("x", "utf8")),
          version: "1.0.0",
        },
      },
    });

    const r = installAssets(
      [{ source: "only.txt", target: "only.txt" }],
      pkg,
      destBase,
      opts(),
    );

    expect(
      r.staleOutcomes.some(
        (s) => s.kind === "stale_record_dropped" && s.target === "rules/missing.mdc",
      ),
    ).toBe(true);
    const state = loadManagedState(destBase);
    expect(state?.files["rules/missing.mdc"]).toBeUndefined();
  });
});
