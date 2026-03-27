import { describe, expect, it, vi } from "vitest";
import {
  createDefaultWorkflowModels,
  normalizeProjectConfig,
} from "../domain/config.js";
import {
  promptGitHubMcpTokenForInit,
  runInitQuestionnaire,
  type QuestionnairePrompts,
} from "./init-questionnaire.js";
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
          preDevelopmentReview: "optional",
          postDevelopmentReview: "optional",
          testing: "required",
        },
        models: createDefaultWorkflowModels(),
      },
    });
    expect(result.shouldWriteProjectConfig).toBe(true);
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
          sizeField: "Size",
          mcpServerName: "github",
        },
      },
      workflow: {
        defaults: {
          preDevelopmentReview: "required" as const,
          postDevelopmentReview: "optional" as const,
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

  it("promptGitHubMcpTokenForInit collects auth when gh accounts are available", async () => {
    vi.spyOn(githubAuth, "listGitHubAccounts").mockResolvedValue([
      { account: "alice", host: "github.com", active: true },
    ]);
    vi.spyOn(githubAuth, "resolveGitHubTokenForAccount").mockResolvedValue(
      "ghp_from_gh",
    );
    const prompts = createPrompts();
    vi.mocked(prompts.select).mockResolvedValueOnce({
      kind: "gh-account",
      account: "alice",
    });

    const token = await promptGitHubMcpTokenForInit(prompts);

    expect(token).toBe("ghp_from_gh");
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

  it("promptGitHubMcpTokenForInit embeds GitHub MCP context in the password prompt when gh and env token are unavailable", async () => {
    vi.spyOn(githubAuth, "listGitHubAccounts").mockResolvedValue([]);
    const prompts = createPrompts();
    vi.mocked(prompts.password).mockResolvedValueOnce("ghp_manual");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const token = await promptGitHubMcpTokenForInit(prompts);

    expect(token).toBe("ghp_manual");
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
