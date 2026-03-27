import { describe, expect, it } from "vitest";
import {
  createDefaultProjectConfig,
  normalizeProjectConfig,
  type ProjectConfig,
} from "../domain/config.js";
import { renderWorkflowMarkdownAsset } from "./workflow-asset-renderer.js";

function ghConfig(): ProjectConfig {
  return normalizeProjectConfig({
    backlog: {
      provider: "github-issues",
      "github-issues": {
        repository: "acme/widget",
        projectNumber: 7,
        projectOwner: "acme-corp",
        priorityField: "Prio",
        statusField: "State",
        label: "roadmap",
        mcpServerName: "github",
      },
    },
    workflow: {
      defaults: { architectReview: "optional", testing: "required" },
      models: createDefaultProjectConfig().workflow.models,
    },
  });
}

describe("renderWorkflowMarkdownAsset", () => {
  it("substitutes backlog and defaults for file-backed config", () => {
    const cfg = normalizeProjectConfig({
      backlog: { provider: "file", file: { path: "custom/backlog.md" } },
      workflow: {
        defaults: { architectReview: "required", testing: "optional" },
        models: createDefaultProjectConfig().workflow.models,
      },
    });
    const out = renderWorkflowMarkdownAsset(
      "Path: {{BACKLOG_FILE_PATH}}\n{{BACKLOG_DETAILS_MARKDOWN}}\n" +
        "{{DEFAULT_PRE_DEVELOPMENT_REVIEW}}/{{DEFAULT_POST_DEVELOPMENT_REVIEW}}/{{DEFAULT_TESTING}}\n" +
        "{{INSTALLED_WORKFLOW_CONTEXT_SUMMARY}}",
      cfg,
      { kind: "markdown" },
    );
    expect(out).toContain("custom/backlog.md");
    expect(out).toContain("file-backed markdown");
    expect(out).toContain("required/optional/optional");
    expect(out).toContain("Backlog: markdown file `custom/backlog.md`");
  });

  it("substitutes GitHub Project metadata for github-issues config", () => {
    const cfg = ghConfig();
    const out = renderWorkflowMarkdownAsset(
      "{{GITHUB_REPOSITORY}} #{{GITHUB_PROJECT_NUMBER}} owner {{GITHUB_PROJECT_OWNER}} {{GITHUB_PRIORITY_FIELD}}/{{GITHUB_STATUS_FIELD}}/{{GITHUB_SIZE_FIELD}} label={{GITHUB_LABEL}}",
      cfg,
      { kind: "markdown" },
    );
    expect(out).toBe(
      "acme/widget #7 owner acme-corp Prio/State/Size label=roadmap",
    );
  });

  it("replaces {{MODEL}} when agentRole is set", () => {
    const cfg = createDefaultProjectConfig();
    const out = renderWorkflowMarkdownAsset(
      "model: {{MODEL}}",
      {
        ...cfg,
        workflow: {
          ...cfg.workflow,
          models: { ...cfg.workflow.models, developer: "dev-model-x" },
        },
      },
      { kind: "markdown", agentRole: "developer" },
    );
    expect(out).toBe("model: dev-model-x");
  });

  it("uses workflow.models.architect2 for agentRole architect2", () => {
    const cfg = normalizeProjectConfig({
      backlog: { provider: "file", file: { path: "docs/backlog.md" } },
      workflow: {
        defaults: {
          preDevelopmentReview: "required",
          postDevelopmentReview: "required",
          testing: "required",
        },
        models: {
          ...createDefaultProjectConfig().workflow.models,
          architect2: "review-model-z",
        },
      },
    });
    const out = renderWorkflowMarkdownAsset(
      "model: {{MODEL}}",
      cfg,
      { kind: "markdown", agentRole: "architect2" },
    );
    expect(out).toBe("model: review-model-z");
  });

  it("throws when {{MODEL}} is missing for agentRole", () => {
    expect(() =>
      renderWorkflowMarkdownAsset(
        "no model",
        createDefaultProjectConfig(),
        { kind: "markdown", agentRole: "tester" },
      ),
    ).toThrow(/missing.*\{\{MODEL\}\}/);
  });

  it("throws when template contains unknown placeholders", () => {
    expect(() =>
      renderWorkflowMarkdownAsset(
        "{{UNKNOWN_TOKEN}}",
        createDefaultProjectConfig(),
        { kind: "markdown" },
      ),
    ).toThrow(/Unresolved workflow template placeholders/);
  });

  it("embeds a base64 project-config snapshot when embedInitProjectConfigSnapshot is set", () => {
    const cfg = normalizeProjectConfig({
      backlog: { provider: "file", file: { path: "docs/backlog.md" } },
      workflow: {
        defaults: { architectReview: "required", testing: "required" },
        models: createDefaultProjectConfig().workflow.models,
      },
    });
    const out = renderWorkflowMarkdownAsset(
      "intro only",
      cfg,
      { kind: "markdown", embedInitProjectConfigSnapshot: true },
    );
    expect(out).toContain("<!-- byrde:installed-project-config v1");
    const roundTrip = JSON.parse(
      Buffer.from(
        out.match(/v1\s*\n([\s\S]*?)\n-->/m)![1]!.trim(),
        "base64",
      ).toString("utf8"),
    );
    expect(normalizeProjectConfig(roundTrip)).toEqual(cfg);
  });

  it("updates rendered output when normalized config changes", () => {
    const tpl =
      "Backlog path {{BACKLOG_FILE_PATH}} pre {{DEFAULT_PRE_DEVELOPMENT_REVIEW}}";
    const a = normalizeProjectConfig({
      backlog: { provider: "file", file: { path: "a.md" } },
      workflow: {
        defaults: {
          preDevelopmentReview: "required",
          postDevelopmentReview: "optional",
          testing: "required",
        },
        models: createDefaultProjectConfig().workflow.models,
      },
    });
    const b = normalizeProjectConfig({
      backlog: { provider: "file", file: { path: "b.md" } },
      workflow: {
        defaults: {
          preDevelopmentReview: "optional",
          postDevelopmentReview: "optional",
          testing: "optional",
        },
        models: createDefaultProjectConfig().workflow.models,
      },
    });
    expect(renderWorkflowMarkdownAsset(tpl, a, { kind: "markdown" })).not.toBe(
      renderWorkflowMarkdownAsset(tpl, b, { kind: "markdown" }),
    );
  });
});
