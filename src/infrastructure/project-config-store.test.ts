import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultWorkflowModels } from "../domain/config.js";
import {
  ensureProjectConfig,
  loadProjectConfig,
  projectConfigPath,
} from "./project-config-store.js";

describe("project-config-store", () => {
  it("loads legacy .cursor/byrde.json when workflow.json is missing", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-config-legacy-"));
    const legacyPath = path.join(cwd, ".cursor", "byrde.json");

    try {
      mkdirSync(path.dirname(legacyPath), { recursive: true });
      writeFileSync(
        legacyPath,
        `${JSON.stringify({
          backlog: {
            provider: "file",
            file: {
              path: "planning/backlog.md",
            },
          },
          workflow: {
            defaults: {
              architectReview: "optional",
              testing: "required",
            },
          },
        }, null, 2)}\n`,
        "utf8",
      );

      expect(loadProjectConfig(cwd)).toEqual({
        backlog: {
          provider: "file",
          file: {
            path: "planning/backlog.md",
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
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("writes workflow.json without overwriting existing user config", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-config-write-"));

    try {
      const models = createDefaultWorkflowModels();
      const first = ensureProjectConfig(cwd, {
        backlog: {
          provider: "file",
          file: {
            path: "docs/backlog.md",
          },
        },
        workflow: {
          defaults: {
            architectReview: "required",
            testing: "optional",
          },
          models,
        },
      });
      const second = ensureProjectConfig(cwd, {
        backlog: {
          provider: "github-issues",
          "github-issues": {
            repository: "acme/demo",
            projectNumber: 1,
            priorityField: "Priority",
            statusField: "Status",
            label: "workflow",
            mcpServerName: "github",
          },
        },
        workflow: {
          defaults: {
            architectReview: "optional",
            testing: "required",
          },
          models,
        },
      });

      expect(first.created).toBe(true);
      expect(first.path).toBe(projectConfigPath(cwd));
      expect(second.created).toBe(false);
      expect(
        JSON.parse(readFileSync(projectConfigPath(cwd), "utf8")),
      ).toEqual({
        backlog: {
          provider: "file",
          file: {
            path: "docs/backlog.md",
          },
        },
        workflow: {
          defaults: {
            architectReview: "required",
            testing: "optional",
          },
          models,
        },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
