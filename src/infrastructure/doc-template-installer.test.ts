import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDefaultWorkflowModels } from "../domain/config.js";
import {
  BASE_TEMPLATE_DOC_ENTRIES,
  scaffoldTemplateDocs,
} from "./doc-template-installer.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("scaffoldTemplateDocs", () => {
  it("creates docs/testability/README.md and other template docs when missing", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-doc-scaffold-"));

    try {
      const result = scaffoldTemplateDocs(packageRoot, cwd);

      const overview = path.join(cwd, "docs", "overview.md");
      const design = path.join(cwd, "docs", "design.md");
      const backlog = path.join(cwd, "docs", "backlog.md");
      const testabilityReadme = path.join(cwd, "docs", "testability", "README.md");

      expect(result.created).toEqual(
        expect.arrayContaining([overview, design, backlog, testabilityReadme]),
      );
      expect(result.skipped).toEqual([]);

      expect(readFileSync(testabilityReadme, "utf8")).toContain("Testability index");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("skips only pre-existing files and still creates missing nested testability README", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-doc-partial-"));

    try {
      const docsDir = path.join(cwd, "docs");
      const testabilityDir = path.join(docsDir, "testability");
      mkdirSync(testabilityDir, { recursive: true });
      writeFileSync(
        path.join(testabilityDir, "010-existing.md"),
        "# keep me\n",
        "utf8",
      );

      const result = scaffoldTemplateDocs(packageRoot, cwd);

      const readme = path.join(testabilityDir, "README.md");
      expect(result.created).toContain(readme);
      expect(readFileSync(readme, "utf8").length).toBeGreaterThan(0);
      expect(result.skipped).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("does not overwrite existing template targets", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-doc-skip-"));

    try {
      const docsDir = path.join(cwd, "docs");
      const testabilityDir = path.join(docsDir, "testability");
      mkdirSync(testabilityDir, { recursive: true });
      const existingReadme = path.join(testabilityDir, "README.md");
      writeFileSync(existingReadme, "# user owned\n", "utf8");

      const result = scaffoldTemplateDocs(packageRoot, cwd);

      expect(result.skipped).toContain(existingReadme);
      expect(readFileSync(existingReadme, "utf8")).toBe("# user owned\n");
      expect(result.created.length).toBe(BASE_TEMPLATE_DOC_ENTRIES.length);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("skips local backlog scaffolding when GitHub issues is the configured backlog", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-doc-github-issues-"));

    try {
      const result = scaffoldTemplateDocs(packageRoot, cwd, {
        backlog: {
          provider: "github-issues",
          "github-issues": {
            repository: "acme/demo",
            projectNumber: 1,
            priorityField: "Priority",
            statusField: "Status",
            mcpServerName: "github",
          },
        },
        workflow: {
          defaults: {
            architectReview: "optional",
            testing: "required",
          },
          models: createDefaultWorkflowModels(),
        },
      });

      expect(result.created).not.toContain(path.join(cwd, "docs", "backlog.md"));
      expect(result.created).toEqual(
        expect.arrayContaining([
          path.join(cwd, "docs", "overview.md"),
          path.join(cwd, "docs", "design.md"),
          path.join(cwd, "docs", "testability", "README.md"),
        ]),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("scaffolds a custom file-backed backlog path from workflow config", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-doc-custom-backlog-"));

    try {
      const result = scaffoldTemplateDocs(packageRoot, cwd, {
        backlog: {
          provider: "file",
          file: {
            path: "planning/backlog.md",
          },
        },
        workflow: {
          defaults: {
            architectReview: "required",
            testing: "optional",
          },
          models: createDefaultWorkflowModels(),
        },
      });

      const customBacklog = path.join(cwd, "planning", "backlog.md");
      expect(result.created).toContain(customBacklog);
      expect(readFileSync(customBacklog, "utf8").length).toBeGreaterThan(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
