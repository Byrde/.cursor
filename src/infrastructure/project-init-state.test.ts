import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDefaultWorkflowModels, normalizeProjectConfig } from "../domain/config.js";
import {
  classifyDetectedProjectSetup,
  compareDetectedSetupToTarget,
  getProjectInitializationPhase,
  inspectProjectInitState,
  isDesignInTemplateMode,
  isFileBacklogPlaceholderOnly,
  isOverviewInTemplateMode,
  isProjectInitialized,
  loadProjectConfigForInitCliChecks,
  parseProjectConfigSnapshotFromPromptMarkdown,
} from "./project-init-state.js";
import { writeGitHubMcpServer } from "./github-mcp-store.js";
import { clearInitSession, writeInitSession } from "./init-session-store.js";
import { renderWorkflowMarkdownAsset } from "./workflow-asset-renderer.js";
import {
  buildKeepDetectedEffectiveConfig,
} from "./provider-transition-prompt.js";

function fileConfig() {
  return normalizeProjectConfig({
    backlog: {
      provider: "file",
      file: { path: "docs/backlog.md" },
    },
    workflow: {
      defaults: {
        preDevelopmentReview: "required",
        postDevelopmentReview: "optional",
        testing: "required",
      },
      models: createDefaultWorkflowModels(),
    },
  });
}

function githubConfig() {
  return normalizeProjectConfig({
    backlog: {
      provider: "github-issues",
      "github-issues": {
        repository: "acme/demo",
        projectNumber: 1,
        priorityField: "Priority",
        statusField: "Status",
        label: "backlog",
        mcpServerName: "github",
      },
    },
    workflow: {
      defaults: {
        preDevelopmentReview: "required",
        postDevelopmentReview: "optional",
        testing: "required",
      },
      models: createDefaultWorkflowModels(),
    },
  });
}

describe("project-init-state", () => {
  it("parses embedded project config from init prompt markdown", () => {
    const cfg = fileConfig();
    const md = renderWorkflowMarkdownAsset(
      "body",
      cfg,
      { kind: "markdown", embedInitProjectConfigSnapshot: true },
    );
    expect(parseProjectConfigSnapshotFromPromptMarkdown(md)).toEqual(cfg);
  });

  it("loadProjectConfigForInitCliChecks prefers baked snapshot over workflow.json", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-snap-"));
    try {
      mkdirSync(path.join(cwd, ".cursor", "prompts"), { recursive: true });
      const baked = fileConfig();
      const prompt = renderWorkflowMarkdownAsset("x", baked, {
        kind: "markdown",
        embedInitProjectConfigSnapshot: true,
      });
      writeFileSync(
        path.join(cwd, ".cursor", "prompts", "project-initialization.md"),
        prompt,
      );
      const conflicting = normalizeProjectConfig({
        backlog: { provider: "file", file: { path: "wrong-path.md" } },
        workflow: baked.workflow,
      });
      writeFileSync(
        path.join(cwd, ".cursor", "workflow.json"),
        `${JSON.stringify(conflicting, null, 2)}\n`,
        "utf8",
      );
      expect(loadProjectConfigForInitCliChecks(cwd)?.backlog).toEqual(baked.backlog);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("loadProjectConfigForInitCliChecks reads legacy init/ path when prompts/ is absent", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-snap-legacy-"));
    try {
      mkdirSync(path.join(cwd, ".cursor", "init"), { recursive: true });
      const baked = fileConfig();
      const prompt = renderWorkflowMarkdownAsset("x", baked, {
        kind: "markdown",
        embedInitProjectConfigSnapshot: true,
      });
      writeFileSync(path.join(cwd, ".cursor", "init", "project-initialization.md"), prompt);
      const conflicting = normalizeProjectConfig({
        backlog: { provider: "file", file: { path: "wrong-path.md" } },
        workflow: baked.workflow,
      });
      writeFileSync(
        path.join(cwd, ".cursor", "workflow.json"),
        `${JSON.stringify(conflicting, null, 2)}\n`,
        "utf8",
      );
      expect(loadProjectConfigForInitCliChecks(cwd)?.backlog).toEqual(baked.backlog);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects template overview and design", () => {
    expect(
      isOverviewInTemplateMode("# Software Development Project: [Project Name]\n"),
    ).toBe(true);
    expect(isOverviewInTemplateMode("# Real\n")).toBe(false);
    expect(
      isDesignInTemplateMode(
        "| **[Term]** | [Definition of the term within this specific domain.] |",
      ),
    ).toBe(true);
    expect(isDesignInTemplateMode("# Design\n\nConcrete text.\n")).toBe(false);
  });

  it("detects placeholder backlog rows", () => {
    expect(isFileBacklogPlaceholderOnly("|[Epic from Key Features]|")).toBe(true);
    expect(isFileBacklogPlaceholderOnly("| Real Epic | 1 | Task |")).toBe(false);
    expect(
      isFileBacklogPlaceholderOnly(
        "See [Epic from Key Features] in the guide — not a table row.\n",
      ),
    ).toBe(false);
  });

  it("classifies phases using the init session record", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-phase-"));
    const cfg = fileConfig();
    try {
      mkdirSync(path.join(cwd, "docs"), { recursive: true });
      writeFileSync(
        path.join(cwd, "docs", "overview.md"),
        readFileSync(
          path.join(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../assets/templates/overview.md",
          ),
          "utf8",
        ),
      );
      expect(getProjectInitializationPhase(cwd, cfg)).toBe("needs_initialization");

      writeInitSession(cwd, {
        agentLaunchedAt: new Date().toISOString(),
        packageVersion: "0.0.1",
      });
      expect(getProjectInitializationPhase(cwd, cfg)).toBe("incomplete_previous_init");

      clearInitSession(cwd);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("treats GitHub backlog as initialized when overview and design are substantive (no completion marker)", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-gh-"));
    const cfg = githubConfig();
    try {
      mkdirSync(path.join(cwd, "docs"), { recursive: true });
      writeFileSync(path.join(cwd, "docs", "overview.md"), "# My App\n");
      writeFileSync(
        path.join(cwd, "docs", "design.md"),
        "# Design\n\nConcrete domain description.\n",
      );
      expect(isProjectInitialized(cwd, cfg)).toBe(true);
      expect(getProjectInitializationPhase(cwd, cfg)).toBe("already_initialized");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("reports initialized when docs are substantive and backlog exists without legacy placeholders (file provider)", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-ok-"));
    const cfg = fileConfig();
    try {
      mkdirSync(path.join(cwd, "docs"), { recursive: true });
      writeFileSync(path.join(cwd, "docs", "overview.md"), "# My App\n");
      writeFileSync(
        path.join(cwd, "docs", "design.md"),
        "# Design\n\nConcrete domain description.\n",
      );
      writeFileSync(
        path.join(cwd, "docs", "backlog.md"),
        [
          "| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |",
          "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
          "| 001 | A | 1 |  | B | C | `TODO` |  |  |",
        ].join("\n"),
      );
      expect(isProjectInitialized(cwd, cfg)).toBe(true);
      expect(getProjectInitializationPhase(cwd, cfg)).toBe("already_initialized");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("reports initialized for file provider with lightweight backlog scaffold (header-only table)", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-scaffold-"));
    const cfg = fileConfig();
    try {
      mkdirSync(path.join(cwd, "docs"), { recursive: true });
      writeFileSync(path.join(cwd, "docs", "overview.md"), "# My App\n");
      writeFileSync(
        path.join(cwd, "docs", "design.md"),
        "# Design\n\nConcrete domain description.\n",
      );
      writeFileSync(
        path.join(cwd, "docs", "backlog.md"),
        [
          "# Project Backlog",
          "",
          "| Entry | Epic |",
          "| :--- | :--- |",
        ].join("\n"),
      );
      expect(isFileBacklogPlaceholderOnly(readFileSync(path.join(cwd, "docs", "backlog.md"), "utf8"))).toBe(
        false,
      );
      expect(isProjectInitialized(cwd, cfg)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("inspectProjectInitState aggregates snapshot, docs, backlog, and MCP signal", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-inspect-"));
    try {
      mkdirSync(path.join(cwd, ".cursor", "prompts"), { recursive: true });
      const baked = fileConfig();
      const prompt = renderWorkflowMarkdownAsset("x", baked, {
        kind: "markdown",
        embedInitProjectConfigSnapshot: true,
      });
      writeFileSync(
        path.join(cwd, ".cursor", "prompts", "project-initialization.md"),
        prompt,
      );
      mkdirSync(path.join(cwd, "docs"), { recursive: true });
      writeFileSync(path.join(cwd, "docs", "overview.md"), "# Real\n");
      writeFileSync(
        path.join(cwd, "docs", "design.md"),
        "# Design\n\n| Term | Meaning |\n| --- | --- |\n| X | Y |\n",
      );
      writeFileSync(
        path.join(cwd, "docs", "backlog.md"),
        [
          "| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |",
          "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
          "| 001 | A | 1 |  | B | C | `TODO` |  |  |",
        ].join("\n"),
      );

      const inspection = inspectProjectInitState(cwd);
      expect(inspection.resolvedInstalledConfig?.backlog.provider).toBe("file");
      expect(inspection.docs.overviewTemplate).toBe(false);
      expect(inspection.fileBacklog.placeholderOnly).toBe(false);
      expect(inspection.managedGitHubMcp.present).toBe(false);

      const classified = classifyDetectedProjectSetup(inspection);
      expect(classified.kind).toBe("scaffolded_file");
      expect(compareDetectedSetupToTarget(classified, baked)).toBe("matches_target");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("classifies mixed embedded vs persisted provider as ambiguous", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-mixed-"));
    try {
      mkdirSync(path.join(cwd, ".cursor", "prompts"), { recursive: true });
      const snapGh = githubConfig();
      const prompt = renderWorkflowMarkdownAsset("x", snapGh, {
        kind: "markdown",
        embedInitProjectConfigSnapshot: true,
      });
      writeFileSync(
        path.join(cwd, ".cursor", "prompts", "project-initialization.md"),
        prompt,
      );
      writeFileSync(
        path.join(cwd, ".cursor", "workflow.json"),
        `${JSON.stringify(fileConfig(), null, 2)}\n`,
        "utf8",
      );

      const inspection = inspectProjectInitState(cwd);
      const classified = classifyDetectedProjectSetup(inspection);
      expect(classified.kind).toBe("mixed_ambiguous");
      expect(classified.evidence.conflictSignals.length).toBeGreaterThan(0);
      expect(compareDetectedSetupToTarget(classified, fileConfig())).toBe("ambiguous");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects GitHub scaffold from persisted workflow and managed MCP", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-gh-class-"));
    try {
      mkdirSync(path.join(cwd, ".cursor"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".cursor", "workflow.json"),
        `${JSON.stringify(githubConfig(), null, 2)}\n`,
        "utf8",
      );

      writeGitHubMcpServer({ cwd, serverName: "github", token: "t" });

      const inspection = inspectProjectInitState(cwd);
      expect(inspection.managedGitHubMcp.present).toBe(true);
      const classified = classifyDetectedProjectSetup(inspection);
      expect(classified.kind).toBe("scaffolded_github");
      expect(
        compareDetectedSetupToTarget(classified, githubConfig()),
      ).toBe("matches_target");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("buildKeepDetectedEffectiveConfig merges questionnaire workflow with detected backlog", () => {
    const detected = fileConfig();
    const target = normalizeProjectConfig({
      backlog: githubConfig().backlog,
      workflow: {
        defaults: {
          preDevelopmentReview: "optional",
          postDevelopmentReview: "optional",
          testing: "optional",
        },
        models: createDefaultWorkflowModels(),
      },
    });

    const merged = buildKeepDetectedEffectiveConfig(target, {
      kind: "scaffolded_file",
      evidence: { fileSignals: [], githubSignals: [], conflictSignals: [] },
      bestResolvedInstalledConfig: detected,
    });
    expect(merged?.backlog).toEqual(detected.backlog);
    expect(merged?.workflow.defaults).toEqual(target.workflow.defaults);
  });
});
