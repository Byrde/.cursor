import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultWorkflowModels, normalizeProjectConfig } from "../domain/config.js";
import {
  ensureProjectConfig,
  loadProjectConfig,
  projectConfigPath,
} from "./project-config-store.js";

describe("project-config-store", () => {
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
            preDevelopmentReview: "required",
            postDevelopmentReview: "optional",
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
            sizeField: "Size",
            label: "workflow",
            mcpServerName: "github",
          },
        },
        workflow: {
          defaults: {
            preDevelopmentReview: "optional",
            postDevelopmentReview: "optional",
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
      ).toEqual(
        normalizeProjectConfig({
          backlog: {
            provider: "file",
            file: {
              path: "docs/backlog.md",
            },
          },
          workflow: {
            defaults: {
              preDevelopmentReview: "required",
              postDevelopmentReview: "optional",
              testing: "optional",
            },
            models,
          },
        }),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
