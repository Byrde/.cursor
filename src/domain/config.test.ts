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
          preDevelopmentReview: "required",
          postDevelopmentReview: "optional",
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
        sizeField: "Size",
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

  it("normalizes github-issues sizeField and allows overrides", () => {
    const raw = {
      backlog: {
        provider: "github-issues",
        "github-issues": {
          repository: "org/repo",
          projectNumber: 2,
          sizeField: "Estimate",
        },
      },
      workflow: {},
    };
    expect(normalizeProjectConfig(raw).backlog).toEqual({
      provider: "github-issues",
      "github-issues": {
        repository: "org/repo",
        projectNumber: 2,
        priorityField: "Priority",
        statusField: "Status",
        sizeField: "Estimate",
        mcpServerName: "github",
      },
    });
  });

  it("sets workflow.models.architect2 from architect1 when architect2 and architectReview are omitted", () => {
    const raw = {
      backlog: {
        provider: "file",
        file: { path: "docs/backlog.md" },
      },
      workflow: {
        models: {
          planner: "a",
          architect: "draft-model",
          developer: "c",
          tester: "d",
        },
      },
    };
    expect(normalizeProjectConfig(raw).workflow.models.architect1).toBe(
      "draft-model",
    );
    expect(normalizeProjectConfig(raw).workflow.models.architect2).toBe(
      "draft-model",
    );
  });

  it("preserves explicit workflow.models.architectReview as architect2", () => {
    const raw = {
      backlog: {
        provider: "file",
        file: { path: "docs/backlog.md" },
      },
      workflow: {
        models: {
          planner: "a",
          architect: "b",
          architectReview: "review-only",
          developer: "c",
          tester: "d",
        },
      },
    };
    expect(normalizeProjectConfig(raw).workflow.models.architect2).toBe(
      "review-only",
    );
  });

  it("prefers architect1 over legacy architect when both present", () => {
    const raw = {
      backlog: {
        provider: "file",
        file: { path: "docs/backlog.md" },
      },
      workflow: {
        models: {
          architect1: "one",
          architect: "legacy",
          developer: "c",
          tester: "d",
        },
      },
    };
    expect(normalizeProjectConfig(raw).workflow.models.architect1).toBe("one");
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
