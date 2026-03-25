import { describe, expect, it } from "vitest";
import {
  createDefaultProjectConfig,
  createDefaultWorkflowModels,
  normalizeProjectConfig,
} from "./config.js";

describe("normalizeProjectConfig", () => {
  it("fills workflow.models when missing", () => {
    const raw = {
      backlog: {
        provider: "file",
        file: { path: "docs/backlog.md" },
      },
      workflow: {
        defaults: {
          architectReview: "required",
          testing: "optional",
        },
      },
    };
    expect(normalizeProjectConfig(raw)).toEqual({
      backlog: {
        provider: "file",
        file: { path: "docs/backlog.md" },
      },
      workflow: {
        defaults: {
          architectReview: "required",
          testing: "optional",
        },
        models: createDefaultWorkflowModels(),
      },
    });
  });

  it("returns defaults for non-object input", () => {
    expect(normalizeProjectConfig(null)).toEqual(createDefaultProjectConfig());
  });

  it("normalizes github-issues blocks with label and defaults for optional fields", () => {
    const raw = {
      backlog: {
        provider: "github-issues",
        "github-issues": {
          repository: "org/repo",
          projectNumber: 1,
          label: "backlog",
          mcpServerName: "github",
        },
      },
      workflow: {
        defaults: {
          architectReview: "required",
          testing: "optional",
        },
      },
    };
    expect(normalizeProjectConfig(raw).backlog).toEqual({
      provider: "github-issues",
      "github-issues": {
        repository: "org/repo",
        projectNumber: 1,
        priorityField: "Priority",
        statusField: "Status",
        label: "backlog",
        mcpServerName: "github",
      },
    });
  });

  it("falls back to file backlog when github-issues provider has no nested block", () => {
    const raw = {
      backlog: {
        provider: "github-issues",
      },
      workflow: {},
    };
    expect(normalizeProjectConfig(raw).backlog).toEqual(
      createDefaultProjectConfig().backlog,
    );
  });

  it("falls back to file backlog when repository or projectNumber is missing", () => {
    const raw = {
      backlog: {
        provider: "github-issues",
        "github-issues": {
          repository: "org/repo",
          label: "backlog",
        },
      },
      workflow: {},
    };
    expect(normalizeProjectConfig(raw).backlog).toEqual(
      createDefaultProjectConfig().backlog,
    );
  });
});
