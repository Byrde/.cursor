import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createDefaultWorkflowModels } from "../domain/config.js";
import { runInit } from "./init.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

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
            architectReview: "required",
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
        readFileSync(path.join(cwd, ".cursor", "agents", "architect.md"), "utf8"),
      ).not.toContain("{{MODEL}}");
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
          projectConfig: {
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
                architectReview: "optional",
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
          projectConfig: {
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
                architectReview: "required",
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
});
