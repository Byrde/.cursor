import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createDefaultWorkflowModels,
  normalizeProjectConfig,
} from "../domain/config.js";
import { writeInitSession } from "../infrastructure/init-session-store.js";
import { ProviderTransitionRequiredError, runInit } from "./init.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function githubProjectConfig() {
  return {
    backlog: {
      provider: "github-issues" as const,
      "github-issues": {
        repository: "acme/demo",
        projectNumber: 1,
        priorityField: "Priority",
        statusField: "Status",
        sizeField: "Size",
        label: "backlog",
        mcpServerName: "github",
      },
    },
    workflow: {
      defaults: {
        preDevelopmentReview: "required" as const,
        postDevelopmentReview: "optional" as const,
        testing: "required" as const,
      },
      models: createDefaultWorkflowModels(),
    },
  };
}

describe("runInit", () => {
  it("writes workflow config and docs for a file-backed project", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-file-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = await runInit(
        {
          cwd,
          skipMcp: false,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: true,
        },
        packageRoot,
      );

      expect(result.manifestOutcomes.length).toBeGreaterThan(0);
      expect(result.warnings).toEqual([]);
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith("Project scaffolded.");
      expect(warnSpy).not.toHaveBeenCalled();
      expect(
        JSON.parse(readFileSync(path.join(cwd, ".cursor", "workflow.json"), "utf8")),
      ).toEqual({
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
            testing: "required",
          },
          models: createDefaultWorkflowModels(),
        },
      });
      expect(() => readFileSync(path.join(cwd, ".github", "workflow-policy.yml"), "utf8"))
        .toThrow();
      expect(() => readFileSync(path.join(cwd, ".cursor", "mcp.json"), "utf8")).toThrow();
      expect(
        readFileSync(path.join(cwd, "docs", "overview.md"), "utf8"),
      ).toContain("[Project Name]");
      expect(
        readFileSync(
          path.join(cwd, "docs", "testability", "README.md"),
          "utf8",
        ),
      ).toContain("Testability index");
      expect(
        readFileSync(path.join(cwd, "docs", "adr", "README.md"), "utf8"),
      ).toContain("Architecture Decision Records");
      expect(readdirSync(path.join(cwd, "docs", "adr")).sort()).toEqual(["README.md"]);
      expect(
        readFileSync(path.join(cwd, ".cursor", "agents", "architect-1.md"), "utf8"),
      ).not.toContain("{{MODEL}}");
      expect(
        readFileSync(
          path.join(cwd, ".cursor", "agents", "architect-2.md"),
          "utf8",
        ),
      ).not.toContain("{{MODEL}}");
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("installs rendered workflow guidance for completion summaries and GitHub checkbox sync", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-guidance-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await runInit(
        {
          cwd,
          skipMcp: false,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: true,
        },
        packageRoot,
      );

      const globalRules = readFileSync(
        path.join(cwd, ".cursor", "rules", "global.mdc"),
        "utf8",
      );
      const developerAgent = readFileSync(
        path.join(cwd, ".cursor", "agents", "developer.md"),
        "utf8",
      );
      const testerAgent = readFileSync(
        path.join(cwd, ".cursor", "agents", "tester.md"),
        "utf8",
      );

      expect(globalRules).toContain("### Completion invariant (before `Complete`)");
      expect(globalRules).toContain("substantive completion summary");
      expect(globalRules).toContain("workflow-owned");
      expect(developerAgent).toContain("**When you move a task to `Complete`:**");
      expect(developerAgent).toContain("workflow-owned");
      expect(testerAgent).toContain("**When you move a task to `Complete`:**");
      expect(testerAgent).toContain("workflow-owned");
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("prints detailed install output only in verbose mode", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-verbose-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: true,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: true,
        },
        packageRoot,
      );

      const lines = logSpy.mock.calls.map(([line]) => String(line));
      expect(lines[0]).toBe("Project scaffolded.");
      expect(lines.some((line) => line.startsWith("Project config "))).toBe(true);
      expect(lines.some((line) => line.startsWith("Docs scaffolded: "))).toBe(true);
      expect(lines).toContain("No GitHub MCP setup needed for the selected backlog.");
    } finally {
      logSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("throws when provider setup mismatches without a transition acknowledgement", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-mismatch-"));

    try {
      mkdirSync(path.join(cwd, ".cursor"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".cursor", "workflow.json"),
        `${JSON.stringify(
          {
            backlog: { provider: "file", file: { path: "docs/backlog.md" } },
            workflow: {
              defaults: {
                preDevelopmentReview: "required" as const,
                postDevelopmentReview: "optional" as const,
                testing: "required" as const,
              },
              models: createDefaultWorkflowModels(),
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      mkdirSync(path.join(cwd, "docs"), { recursive: true });
      writeFileSync(
        path.join(cwd, "docs", "backlog.md"),
        [
          "| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |",
          "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
          "| 001 | A | 1 |  | B | C | `TODO` |  |  |",
        ].join("\n"),
      );

      await expect(
        runInit(
          {
            cwd,
            skipMcp: true,
            verbose: false,
            force: false,
            packageVersion: "0.0.1",
            skipAgent: true,
            projectConfig: githubProjectConfig(),
            overwriteProjectConfig: true,
          },
          packageRoot,
        ),
      ).rejects.toBeInstanceOf(ProviderTransitionRequiredError);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("applies GitHub backlog target when transition is acknowledged", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-mismatch-ack-"));

    try {
      mkdirSync(path.join(cwd, ".cursor"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".cursor", "workflow.json"),
        `${JSON.stringify(
          {
            backlog: { provider: "file", file: { path: "docs/backlog.md" } },
            workflow: {
              defaults: {
                preDevelopmentReview: "required" as const,
                postDevelopmentReview: "optional" as const,
                testing: "required" as const,
              },
              models: createDefaultWorkflowModels(),
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      mkdirSync(path.join(cwd, "docs"), { recursive: true });
      writeFileSync(
        path.join(cwd, "docs", "backlog.md"),
        [
          "| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |",
          "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
          "| 001 | A | 1 |  | B | C | `TODO` |  |  |",
        ].join("\n"),
      );

      const gh = githubProjectConfig();
      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: true,
          projectConfig: gh,
          overwriteProjectConfig: true,
          providerTransitionAck: { kind: "transition", effectiveConfig: gh },
        },
        packageRoot,
      );

      expect(
        JSON.parse(readFileSync(path.join(cwd, ".cursor", "workflow.json"), "utf8")),
      ).toMatchObject(gh);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("clears managed GitHub MCP and completion marker when transitioning from GitHub to file backlog", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-gh-to-file-"));
    const { writeGitHubMcpServer } = await import(
      "../infrastructure/github-mcp-store.js"
    );

    try {
      const gh = githubProjectConfig();
      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: true,
          projectConfig: gh,
          overwriteProjectConfig: true,
        },
        packageRoot,
      );
      writeFileSync(
        path.join(cwd, ".cursor", "byrde-init-completion.json"),
        `${JSON.stringify(
          { version: 1, completedAt: new Date().toISOString() },
          null,
          2,
        )}\n`,
      );
      writeGitHubMcpServer({ cwd, serverName: "github", token: "t" });

      const fileCfg = {
        backlog: {
          provider: "file" as const,
          file: { path: "docs/backlog.md" },
        },
        workflow: {
          defaults: {
            preDevelopmentReview: "required" as const,
            postDevelopmentReview: "optional" as const,
            testing: "required" as const,
          },
          models: createDefaultWorkflowModels(),
        },
      };

      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: true,
          projectConfig: fileCfg,
          overwriteProjectConfig: true,
          providerTransitionAck: { kind: "transition", effectiveConfig: fileCfg },
        },
        packageRoot,
      );

      expect(() => readFileSync(path.join(cwd, ".cursor", "mcp.json"), "utf8")).toThrow();
      expect(
        existsSync(path.join(cwd, ".cursor", "byrde-init-completion.json")),
      ).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("writes GitHub MCP config when github issues backlog is selected", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-github-"));

    try {
      await runInit(
        {
          cwd,
          skipMcp: false,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: true,
          projectConfig: {
            backlog: {
              provider: "github-issues",
              "github-issues": {
                repository: "acme/demo",
                projectNumber: 1,
                priorityField: "Priority",
                statusField: "Status",
                sizeField: "Size",
                label: "backlog",
                mcpServerName: "github",
              },
            },
            workflow: {
              defaults: {
                preDevelopmentReview: "optional",
                postDevelopmentReview: "optional",
                testing: "optional",
              },
              models: createDefaultWorkflowModels(),
            },
          },
          overwriteProjectConfig: true,
          githubMcpToken: "ghp_secret",
        },
        packageRoot,
      );

      expect(
        JSON.parse(readFileSync(path.join(cwd, ".cursor", "mcp.json"), "utf8")),
      ).toEqual({
        mcpServers: {
          "cursor-workflow:github": {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_secret",
            },
          },
        },
      });
      expect(() => readFileSync(path.join(cwd, "docs", "backlog.md"), "utf8")).toThrow();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("does not overwrite existing config or docs", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-preserve-"));
    const existingConfig = path.join(cwd, ".cursor", "workflow.json");
    const existingOverview = path.join(cwd, "docs", "overview.md");

    try {
      mkdirSync(path.dirname(existingConfig), { recursive: true });
      mkdirSync(path.dirname(existingOverview), { recursive: true });
      writeFileSync(
        existingConfig,
        `${JSON.stringify({
          backlog: { provider: "file", file: { path: "custom.md" } },
          workflow: {
            defaults: {
              architectReview: "optional",
              testing: "required",
            },
          },
        }, null, 2)}\n`,
        "utf8",
      );
      writeFileSync(existingOverview, "# My Real Project\n", "utf8");

      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: true,
          projectConfig: normalizeProjectConfig(
            JSON.parse(readFileSync(existingConfig, "utf8")),
          ),
        },
        packageRoot,
      );

      expect(readFileSync(existingConfig, "utf8")).toContain("custom.md");
      expect(readFileSync(existingOverview, "utf8")).toContain(
        "# My Real Project",
      );
      expect(
        readFileSync(path.join(cwd, "docs", "design.md"), "utf8").length,
      ).toBeGreaterThan(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("warns when github backlog is selected but MCP setup is missing a token", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-github-warn-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = await runInit(
        {
          cwd,
          skipMcp: false,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: true,
          projectConfig: {
            backlog: {
              provider: "github-issues",
              "github-issues": {
                repository: "acme/demo",
                projectNumber: 1,
                priorityField: "Priority",
                statusField: "Status",
                sizeField: "Size",
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
          },
          overwriteProjectConfig: true,
        },
        packageRoot,
      );

      expect(result.manifestOutcomes.length).toBeGreaterThan(0);
      expect(result.warnings.join("\n")).toContain("no GitHub token was provided");
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith("Project scaffolded.");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("no GitHub token was provided"),
      );
      expect(() => readFileSync(path.join(cwd, ".cursor", "mcp.json"), "utf8")).toThrow();
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("skips the agent for GitHub backlog when overview and design are substantive", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-github-agent-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const launcher = vi.fn(async () => ({ exitCode: 0 }));
    const gh = githubProjectConfig();
    try {
      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: true,
          projectConfig: gh,
          overwriteProjectConfig: true,
        },
        packageRoot,
      );
      writeFileSync(path.join(cwd, "docs", "overview.md"), "# Acme App\n");
      writeFileSync(
        path.join(cwd, "docs", "design.md"),
        "# Design\n\nConcrete domain description.\n",
      );
      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: false,
          projectConfig: gh,
          overwriteProjectConfig: false,
          launchAgentSession: launcher,
        },
        packageRoot,
      );
      expect(launcher).not.toHaveBeenCalled();
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes("already initialized"),
        ),
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("resumes when a prior agent launch did not finish initialization", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-resume-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const launcher = vi.fn(async () => ({ exitCode: 0 }));
    const gh = githubProjectConfig();
    try {
      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: true,
          projectConfig: gh,
          overwriteProjectConfig: true,
        },
        packageRoot,
      );
      writeInitSession(cwd, {
        agentLaunchedAt: new Date().toISOString(),
        packageVersion: "0.0.1",
      });
      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: false,
          projectConfig: gh,
          overwriteProjectConfig: false,
          launchAgentSession: launcher,
        },
        packageRoot,
      );
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes("Previous initialization did not finish"),
        ),
      ).toBe(true);
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes("Backlog planning stays out of init"),
        ),
      ).toBe(true);
      expect(launcher).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("skips the agent launcher when the project is already initialized", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-done-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const launcher = vi.fn(
      async (_cwd: string, _prompt: string) => ({ exitCode: 0 }),
    );
    try {
      mkdirSync(path.join(cwd, "docs"), { recursive: true });
      writeFileSync(path.join(cwd, "docs", "overview.md"), "# Acme App\n");
      writeFileSync(
        path.join(cwd, "docs", "design.md"),
        "# Domain\n\n| Term | Meaning |\n| --- | --- |\n| Order | Purchase order |\n",
      );
      writeFileSync(
        path.join(cwd, "docs", "backlog.md"),
        [
          "# Project Backlog",
          "",
          "| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |",
          "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
          "| 001 | Core | 1 |  | First task | Criteria | `TODO` |  |  |",
          "",
        ].join("\n"),
      );
      mkdirSync(path.join(cwd, ".cursor"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".cursor", "workflow.json"),
        `${JSON.stringify(
          {
            backlog: {
              provider: "file",
              file: { path: "docs/backlog.md" },
            },
            workflow: {
              defaults: {
                preDevelopmentReview: "required" as const,
                postDevelopmentReview: "optional" as const,
                testing: "required" as const,
              },
              models: createDefaultWorkflowModels(),
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: false,
          launchAgentSession: launcher,
        },
        packageRoot,
      );
      expect(launcher).not.toHaveBeenCalled();
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes("already initialized"),
        ),
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("calls the injected agent launcher with the installed init prompt", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-agent-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const launcher = vi.fn(
      async (_cwd: string, _prompt: string) => ({ exitCode: 0 }),
    );
    try {
      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: false,
          launchAgentSession: launcher,
        },
        packageRoot,
      );
      expect(launcher).toHaveBeenCalledTimes(1);
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes("Backlog planning is deferred"),
        ),
      ).toBe(true);
      const prompt = String(vi.mocked(launcher).mock.calls[0]![1]);
      expect(prompt).toContain("Dedicated project initialization");
      expect(prompt).toContain("docs/backlog.md");
      expect(prompt).toContain("byrde:installed-project-config");
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("calls the injected agent launcher with the migration prompt when provider transition is acknowledged", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-init-migration-agent-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const launcher = vi.fn(
      async (_cwd: string, _prompt: string) => ({ exitCode: 0 }),
    );
    try {
      mkdirSync(path.join(cwd, ".cursor"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".cursor", "workflow.json"),
        `${JSON.stringify(
          {
            backlog: { provider: "file", file: { path: "docs/backlog.md" } },
            workflow: {
              defaults: {
                preDevelopmentReview: "required" as const,
                postDevelopmentReview: "optional" as const,
                testing: "required" as const,
              },
              models: createDefaultWorkflowModels(),
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      mkdirSync(path.join(cwd, "docs"), { recursive: true });
      writeFileSync(
        path.join(cwd, "docs", "backlog.md"),
        [
          "| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |",
          "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
          "| 001 | A | 1 |  | B | C | `TODO` |  |  |",
        ].join("\n"),
      );

      const gh = githubProjectConfig();
      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: false,
          projectConfig: gh,
          overwriteProjectConfig: true,
          providerTransitionAck: { kind: "transition", effectiveConfig: gh },
          launchAgentSession: launcher,
        },
        packageRoot,
      );

      expect(launcher).toHaveBeenCalledTimes(1);
      const prompt = String(vi.mocked(launcher).mock.calls[0]![1]);
      expect(prompt).toContain("One-time setup reconciliation session");
      expect(prompt).toContain("byrde:installed-project-config");
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes("one-time setup reconciliation session"),
        ),
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("launches reconciliation session when already initialized and provider transition is confirmed", async () => {
    const cwd = mkdtempSync(
      path.join(tmpdir(), "byrde-init-migration-already-init-"),
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const launcher = vi.fn(
      async (_cwd: string, _prompt: string) => ({ exitCode: 0 }),
    );
    try {
      mkdirSync(path.join(cwd, "docs"), { recursive: true });
      writeFileSync(path.join(cwd, "docs", "overview.md"), "# Acme App\n");
      writeFileSync(
        path.join(cwd, "docs", "design.md"),
        "# Domain\n\n| Term | Meaning |\n| --- | --- |\n| Order | Purchase order |\n",
      );
      writeFileSync(
        path.join(cwd, "docs", "backlog.md"),
        [
          "# Project Backlog",
          "",
          "| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |",
          "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
          "| 001 | Core | 1 |  | First task | Criteria | `TODO` |  |  |",
          "",
        ].join("\n"),
      );
      mkdirSync(path.join(cwd, ".cursor"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".cursor", "workflow.json"),
        `${JSON.stringify(
          {
            backlog: {
              provider: "file",
              file: { path: "docs/backlog.md" },
            },
            workflow: {
              defaults: {
                preDevelopmentReview: "required" as const,
                postDevelopmentReview: "optional" as const,
                testing: "required" as const,
              },
              models: createDefaultWorkflowModels(),
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      const gh = githubProjectConfig();
      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: false,
          projectConfig: gh,
          overwriteProjectConfig: true,
          providerTransitionAck: { kind: "transition", effectiveConfig: gh },
          launchAgentSession: launcher,
        },
        packageRoot,
      );

      expect(launcher).toHaveBeenCalledTimes(1);
      const prompt = String(vi.mocked(launcher).mock.calls[0]![1]);
      expect(prompt).toContain("One-time setup reconciliation session");
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes("one-time setup reconciliation session"),
        ),
      ).toBe(true);
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes("Skipping the interactive Cursor agent session"),
        ),
      ).toBe(false);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("uses the init prompt (not migration) when keep_detected was acknowledged", async () => {
    const cwd = mkdtempSync(
      path.join(tmpdir(), "byrde-init-keep-detected-agent-"),
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const launcher = vi.fn(
      async (_cwd: string, _prompt: string) => ({ exitCode: 0 }),
    );
    const fileCfg = normalizeProjectConfig({
      backlog: { provider: "file", file: { path: "docs/backlog.md" } },
      workflow: {
        defaults: {
          preDevelopmentReview: "required" as const,
          postDevelopmentReview: "optional" as const,
          testing: "required" as const,
        },
        models: createDefaultWorkflowModels(),
      },
    });
    try {
      mkdirSync(path.join(cwd, ".cursor"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".cursor", "workflow.json"),
        `${JSON.stringify(fileCfg, null, 2)}\n`,
        "utf8",
      );
      mkdirSync(path.join(cwd, "docs"), { recursive: true });
      writeFileSync(
        path.join(cwd, "docs", "backlog.md"),
        [
          "| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |",
          "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
          "| 001 | A | 1 |  | B | C | `TODO` |  |  |",
        ].join("\n"),
      );

      await runInit(
        {
          cwd,
          skipMcp: true,
          verbose: false,
          force: false,
          packageVersion: "0.0.1",
          skipAgent: false,
          projectConfig: fileCfg,
          overwriteProjectConfig: true,
          providerTransitionAck: {
            kind: "keep_detected",
            effectiveConfig: fileCfg,
          },
          launchAgentSession: launcher,
        },
        packageRoot,
      );

      expect(launcher).toHaveBeenCalledTimes(1);
      const prompt = String(vi.mocked(launcher).mock.calls[0]![1]);
      expect(prompt).toContain("Dedicated project initialization");
      expect(prompt).not.toContain("One-time setup reconciliation session");
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes("one-time setup reconciliation session"),
        ),
      ).toBe(false);
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes("Backlog planning is deferred"),
        ),
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
