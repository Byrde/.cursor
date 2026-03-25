import { describe, expect, it, vi } from "vitest";
import {
  createDefaultWorkflowModels,
  normalizeProjectConfig,
} from "../domain/config.js";
import { runInitQuestionnaire, type QuestionnairePrompts } from "./init-questionnaire.js";
import * as githubAuth from "./github-auth.js";

function createPrompts(): QuestionnairePrompts {
  return {
    select: vi.fn(),
    input: vi.fn(),
    confirm: vi.fn(),
    password: vi.fn(),
  } as unknown as QuestionnairePrompts;
}

describe("runInitQuestionnaire", () => {
  it("collects a fresh file-backed workflow configuration", async () => {
    vi.spyOn(githubAuth, "listGitHubAccounts").mockResolvedValue([]);
    const prompts = createPrompts();
    vi.mocked(prompts.select)
      .mockResolvedValueOnce("file")
      .mockResolvedValueOnce("optional")
      .mockResolvedValueOnce("required");
    vi.mocked(prompts.input)
      .mockResolvedValueOnce("planning/backlog.md");
    vi.mocked(prompts.confirm).mockResolvedValueOnce(true);

    const result = await runInitQuestionnaire(
      { cwd: "/tmp/demo" },
      prompts,
    );

    expect(result.projectConfig).toEqual({
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
    expect(result.shouldWriteProjectConfig).toBe(true);
    expect(result.githubMcpToken).toBeUndefined();
  });

  it("preserves existing setup when reconfigure is declined", async () => {
    vi.spyOn(githubAuth, "listGitHubAccounts").mockResolvedValue([]);
    const prompts = createPrompts();
    vi.mocked(prompts.confirm).mockResolvedValueOnce(false);

    const existingConfig = {
      backlog: {
        provider: "github-issues" as const,
        "github-issues": {
          repository: "acme/demo",
          projectNumber: 2,
          label: "workflow",
          priorityField: "Priority",
          statusField: "Status",
          mcpServerName: "github",
        },
      },
      workflow: {
        defaults: {
          architectReview: "required" as const,
          testing: "optional" as const,
        },
        models: createDefaultWorkflowModels(),
      },
    };
    const result = await runInitQuestionnaire(
      {
        cwd: "/tmp/demo",
        existingConfig,
      },
      prompts,
    );

    expect(result).toEqual({
      projectConfig: normalizeProjectConfig(existingConfig),
      shouldWriteProjectConfig: false,
    });
  });

  it("collects GitHub MCP auth when github issues backlog is selected", async () => {
    vi.spyOn(githubAuth, "listGitHubAccounts").mockResolvedValue([
      { account: "alice", host: "github.com", active: true },
    ]);
    vi.spyOn(githubAuth, "resolveGitHubTokenForAccount").mockResolvedValue(
      "ghp_from_gh",
    );
    const prompts = createPrompts();
    vi.mocked(prompts.select)
      .mockResolvedValueOnce("github-issues")
      .mockResolvedValueOnce("required")
      .mockResolvedValueOnce("optional")
      .mockResolvedValueOnce({
        kind: "gh-account",
        account: "alice",
      });
    vi.mocked(prompts.input)
      .mockResolvedValueOnce("acme/demo")
      .mockResolvedValueOnce("3")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("Priority")
      .mockResolvedValueOnce("Status")
      .mockResolvedValueOnce("");
    vi.mocked(prompts.confirm).mockResolvedValueOnce(true);

    const result = await runInitQuestionnaire(
      { cwd: "/tmp/demo" },
      prompts,
    );

    expect(result.projectConfig.backlog).toEqual({
      provider: "github-issues",
      "github-issues": {
        repository: "acme/demo",
        projectNumber: 3,
        priorityField: "Priority",
        statusField: "Status",
        mcpServerName: "github",
      },
    });
    expect(result.githubMcpToken).toBe("ghp_from_gh");
    expect(githubAuth.resolveGitHubTokenForAccount).toHaveBeenCalledWith(
      "alice",
    );
    expect(prompts.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("GitHub MCP"),
        theme: expect.objectContaining({
          style: expect.objectContaining({
            message: expect.any(Function),
          }),
        }),
      }),
    );
  });

  it("embeds GitHub MCP context in the password prompt when gh and env token are unavailable", async () => {
    vi.spyOn(githubAuth, "listGitHubAccounts").mockResolvedValue([]);
    const prompts = createPrompts();
    vi.mocked(prompts.select)
      .mockResolvedValueOnce("github-issues")
      .mockResolvedValueOnce("required")
      .mockResolvedValueOnce("optional");
    vi.mocked(prompts.input)
      .mockResolvedValueOnce("acme/demo")
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("Priority")
      .mockResolvedValueOnce("Status")
      .mockResolvedValueOnce("");
    vi.mocked(prompts.confirm).mockResolvedValueOnce(true);
    vi.mocked(prompts.password).mockResolvedValueOnce("ghp_manual");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runInitQuestionnaire(
      { cwd: "/tmp/demo" },
      prompts,
    );

    expect(result.githubMcpToken).toBe("ghp_manual");
    expect(prompts.password).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("GitHub MCP"),
        theme: expect.objectContaining({
          style: expect.objectContaining({
            message: expect.any(Function),
          }),
        }),
      }),
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/GitHub MCP/),
    );

    logSpy.mockRestore();
  });
});
