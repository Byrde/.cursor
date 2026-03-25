import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ManifestFileOutcome } from "./file-installer.js";
import { validateInstalledPackageOutputs } from "./install-output-validator.js";

function outcome(
  kind: ManifestFileOutcome["kind"],
  absolutePath: string,
  target = "out.txt",
): ManifestFileOutcome {
  const base = {
    target,
    source: "s.txt",
    absolutePath,
  };
  if (kind === "skipped") {
    return {
      ...base,
      kind: "skipped",
      reason: "tracked_hash_mismatch",
      forced: false,
    };
  }
  if (kind === "updated") {
    return {
      ...base,
      kind: "updated",
      hash: "sha256:x",
      forced: false,
    };
  }
  return {
    ...base,
    kind,
    hash: "sha256:x",
  } as ManifestFileOutcome;
}

describe("validateInstalledPackageOutputs", () => {
  it("succeeds when package-owned targets are non-empty regular files", () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-val-ok-"));
    try {
      const f = join(cwd, ".cursor", "rules", "global.mdc");
      mkdirSync(join(cwd, ".cursor", "rules"), { recursive: true });
      writeFileSync(f, "content\n", "utf8");

      expect(() =>
        validateInstalledPackageOutputs(cwd, [
          outcome("installed", f, "rules/global.mdc"),
        ]),
      ).not.toThrow();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("fails when a package-owned path is missing", () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-val-miss-"));
    try {
      const missing = join(cwd, ".cursor", "rules", "global.mdc");
      expect(() =>
        validateInstalledPackageOutputs(cwd, [
          outcome("installed", missing, "rules/global.mdc"),
        ]),
      ).toThrow(/Post-install validation failed/);
      expect(() =>
        validateInstalledPackageOutputs(cwd, [
          outcome("installed", missing, "rules/global.mdc"),
        ]),
      ).toThrow(/missing/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("fails when a package-owned path is a directory", () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-val-dir-"));
    try {
      const dirPath = join(cwd, ".cursor", "rules", "global.mdc");
      mkdirSync(dirPath, { recursive: true });
      expect(() =>
        validateInstalledPackageOutputs(cwd, [
          outcome("installed", dirPath, "rules/global.mdc"),
        ]),
      ).toThrow(/not a regular file/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("fails when a package-owned file is empty", () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-val-empty-"));
    try {
      const f = join(cwd, ".cursor", "out.txt");
      mkdirSync(join(cwd, ".cursor"), { recursive: true });
      writeFileSync(f, "", "utf8");
      expect(() =>
        validateInstalledPackageOutputs(cwd, [
          outcome("updated", f, "out.txt"),
        ]),
      ).toThrow(/empty file/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("does not validate skipped outcomes", () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-val-skip-"));
    try {
      const missing = join(cwd, ".cursor", "rules", "global.mdc");
      expect(() =>
        validateInstalledPackageOutputs(cwd, [
          outcome("skipped", missing, "rules/global.mdc"),
        ]),
      ).not.toThrow();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("aggregates multiple failures into one message", () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-val-multi-"));
    try {
      const a = join(cwd, ".cursor", "a.txt");
      const b = join(cwd, ".cursor", "b.txt");
      mkdirSync(join(cwd, ".cursor"), { recursive: true });
      writeFileSync(a, "", "utf8");
      mkdirSync(b, { recursive: true });

      expect(() =>
        validateInstalledPackageOutputs(cwd, [
          outcome("installed", a, "a.txt"),
          outcome("updated", b, "b.txt"),
        ]),
      ).toThrow(/Post-install validation failed/);
      expect(() =>
        validateInstalledPackageOutputs(cwd, [
          outcome("installed", a, "a.txt"),
          outcome("updated", b, "b.txt"),
        ]),
      ).toThrow(/a\.txt/);
      expect(() =>
        validateInstalledPackageOutputs(cwd, [
          outcome("installed", a, "a.txt"),
          outcome("updated", b, "b.txt"),
        ]),
      ).toThrow(/b\.txt/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
