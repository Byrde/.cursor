import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { CommanderError, type Command } from "commander";
import {
  createDefaultWorkflowModels,
  normalizeProjectConfig,
} from "./domain/config.js";
import { renderWorkflowMarkdownAsset } from "./infrastructure/workflow-asset-renderer.js";
import { createProgram, reportCliFailure, type InitOptions } from "./cli.js";

const distCliJs = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

/** Subcommands snapshot parent exit/output settings at registration; re-apply for tests. */
function forEachCommand(command: Command, fn: (c: Command) => void): void {
  fn(command);
  for (const sub of command.commands) {
    forEachCommand(sub, fn);
  }
}

function prepareProgramForTest(
  program: Command,
  captureOut?: { help: string; err: string },
): void {
  forEachCommand(program, (c) => {
    c.exitOverride();
    if (captureOut) {
      c.configureOutput({
        writeOut: (s) => {
          captureOut.help += s;
        },
        writeErr: (s) => {
          captureOut.err += s;
        },
      });
    }
  });
}

async function parseForTest(
  argv: string[],
  captureOut: { help: string; err: string },
): Promise<void> {
  const program = createProgram({
    runInitQuestionnaire: async () => ({
      projectConfig: {
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
      },
      shouldWriteProjectConfig: true,
    }),
    runInit: async () => {
      // No-op for parser/help tests.
      return {
        manifestOutcomes: [],
        staleOutcomes: [],
        warnings: [],
      };
    },
    promptProviderTransition: async () => ({
      kind: "transition" as const,
      effectiveConfig: {
        backlog: {
          provider: "file" as const,
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
      },
    }),
    promptGitHubMcpTokenForInit: async () => "unused",
  });
  prepareProgramForTest(program, captureOut);
  // `from: "user"` means argv is only args after the executable (no node / script path).
  await program.parseAsync(argv, { from: "user" });
}

describe("createProgram", () => {
  it("is safe to import without executing the CLI entrypoint", async () => {
    const mod = await import("./cli.js");
    expect(typeof mod.createProgram).toBe("function");
  });

  it("prints init usage on --help", async () => {
    const capture = { help: "", err: "" };
    try {
      await parseForTest(["init", "--help"], capture);
      expect.fail("expected exitOverride throw for help");
    } catch (e) {
      expect(e).toBeInstanceOf(CommanderError);
      expect((e as CommanderError).code).toBe("commander.helpDisplayed");
    }
    expect(capture.help).toContain("Usage:");
    expect(capture.help).toContain("init");
    expect(capture.help).toContain("--cwd");
    expect(capture.help).toContain("--skip-mcp");
    expect(capture.help).toContain("--force");
    expect(capture.help).toContain("--verbose");
    expect(capture.help).toContain("--skip-agent");
  });

  it("applies default option values for init", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-init-defaults-"));
    const runInitSpy = vi.fn(async () => ({
      manifestOutcomes: [],
      staleOutcomes: [],
      warnings: [],
    }));
    const runInitQuestionnaire = vi.fn(async () => ({
      projectConfig: {
        backlog: {
          provider: "file" as const,
          file: {
            path: "docs/backlog.md",
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
      },
      shouldWriteProjectConfig: true,
    }));
    const program = createProgram({
      runInit: runInitSpy,
      runInitQuestionnaire,
    });
    prepareProgramForTest(program);
    await program.parseAsync(["init", "--cwd", cwd], { from: "user" });
    const initCmd = program.commands.find((c) => c.name() === "init");
    expect(initCmd).toBeDefined();
    expect(initCmd!.opts()).toEqual({
      cwd,
      skipMcp: false,
      skipAgent: false,
      force: false,
      verbose: false,
    } satisfies InitOptions);
    expect(runInitSpy).toHaveBeenCalledTimes(1);
    expect(runInitQuestionnaire).toHaveBeenCalledWith({
      cwd,
      existingConfig: undefined,
    });
    expect(runInitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd,
        skipMcp: false,
        overwriteProjectConfig: true,
      }),
      expect.any(String),
    );
  });

  it("passes embedded init snapshot to the questionnaire when workflow.json is absent", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-cli-snap-"));
    try {
      mkdirSync(join(cwd, ".cursor", "prompts"), { recursive: true });
      const cfg = normalizeProjectConfig({
        backlog: {
          provider: "file",
          file: { path: "docs/custom.md" },
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
      const prompt = renderWorkflowMarkdownAsset("x", cfg, {
        kind: "markdown",
        embedInitProjectConfigSnapshot: true,
      });
      writeFileSync(join(cwd, ".cursor", "prompts", "project-initialization.md"), prompt);
      const runInitQuestionnaire = vi.fn(async () => ({
        projectConfig: cfg,
        shouldWriteProjectConfig: false,
      }));
      const runInitSpy = vi.fn(async () => ({
        manifestOutcomes: [],
        staleOutcomes: [],
        warnings: [],
      }));
      const program = createProgram({ runInit: runInitSpy, runInitQuestionnaire });
      prepareProgramForTest(program);
      await program.parseAsync(["init", "--cwd", cwd], { from: "user" });
      expect(runInitQuestionnaire).toHaveBeenCalledWith({
        cwd,
        existingConfig: cfg,
      });
      expect(runInitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd,
          skipMcp: false,
          overwriteProjectConfig: false,
        }),
        expect.any(String),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("parses explicit init flags", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-init-flags-"));
    const runInitSpy = vi.fn(async () => ({
      manifestOutcomes: [],
      staleOutcomes: [],
      warnings: [],
    }));
    const runInitQuestionnaire = vi.fn(async () => ({
      projectConfig: {
        backlog: {
          provider: "file" as const,
          file: {
            path: "docs/backlog.md",
          },
        },
        workflow: {
          defaults: {
            preDevelopmentReview: "optional" as const,
            postDevelopmentReview: "optional" as const,
            testing: "optional" as const,
          },
          models: createDefaultWorkflowModels(),
        },
      },
      shouldWriteProjectConfig: true,
    }));
    const program = createProgram({
      runInit: runInitSpy,
      runInitQuestionnaire,
    });
    prepareProgramForTest(program);
    await program.parseAsync(
      [
        "init",
        "--cwd",
        cwd,
        "--skip-mcp",
        "--skip-agent",
        "--force",
        "--verbose",
      ],
      { from: "user" },
    );
    const initCmd = program.commands.find((c) => c.name() === "init");
    expect(initCmd!.opts()).toEqual({
      cwd,
      skipMcp: true,
      skipAgent: true,
      force: true,
      verbose: true,
    } satisfies InitOptions);
    expect(runInitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd,
        skipMcp: true,
        skipAgent: true,
        force: true,
        verbose: true,
        overwriteProjectConfig: true,
        githubMcpToken: undefined,
      }),
      expect.any(String),
    );
  });

  it("rejects unknown init flags", async () => {
    const capture = { help: "", err: "" };
    await expect(
      parseForTest(["init", "--not-a-real-flag"], capture),
    ).rejects.toMatchObject({
      code: "commander.unknownOption",
    });
  });

  it("does not call provider transition prompt when detected setup matches questionnaire target", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-cli-no-transition-"));
    const fileProjectConfig = {
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
    const promptTransitionSpy = vi.fn(async () => ({
      kind: "transition" as const,
      effectiveConfig: fileProjectConfig,
    }));
    const runInitSpy = vi.fn(async () => ({
      manifestOutcomes: [],
      staleOutcomes: [],
      warnings: [],
    }));
    const runInitQuestionnaire = vi.fn(async () => ({
      projectConfig: fileProjectConfig,
      shouldWriteProjectConfig: true,
    }));
    try {
      const program = createProgram({
        runInit: runInitSpy,
        runInitQuestionnaire,
        promptProviderTransition: promptTransitionSpy,
        promptGitHubMcpTokenForInit: async () => "unused",
      });
      prepareProgramForTest(program);
      await program.parseAsync(["init", "--cwd", cwd], { from: "user" });
      expect(promptTransitionSpy).not.toHaveBeenCalled();
      expect(runInitSpy).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("calls provider transition prompt when questionnaire target mismatches detected file-backed setup", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-cli-transition-mismatch-"));
    const gh = {
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
    const promptTransitionSpy = vi.fn(async () => ({
      kind: "transition" as const,
      effectiveConfig: gh,
    }));
    const runInitSpy = vi.fn(async () => ({
      manifestOutcomes: [],
      staleOutcomes: [],
      warnings: [],
    }));
    try {
      mkdirSync(join(cwd, ".cursor"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(
        join(cwd, ".cursor", "workflow.json"),
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
      writeFileSync(
        join(cwd, "docs", "backlog.md"),
        [
          "| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |",
          "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
          "| 001 | Core | 1 |  | Task | Criteria | `TODO` |  |  |",
        ].join("\n"),
      );

      const program = createProgram({
        runInit: runInitSpy,
        runInitQuestionnaire: async () => ({
          projectConfig: gh,
          shouldWriteProjectConfig: true,
        }),
        promptProviderTransition: promptTransitionSpy,
        promptGitHubMcpTokenForInit: async () => "unused",
      });
      prepareProgramForTest(program);
      await program.parseAsync(["init", "--cwd", cwd], { from: "user" });
      expect(promptTransitionSpy).toHaveBeenCalledTimes(1);
      expect(runInitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          projectConfig: gh,
          providerTransitionAck: expect.objectContaining({
            kind: "transition",
            effectiveConfig: gh,
          }),
        }),
        expect.any(String),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("uses provider transition prompt on mixed/ambiguous setup and respects cancel without running init", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "byrde-cli-transition-cancel-"));
    const promptTransitionSpy = vi.fn(async () => ({ kind: "cancel" as const }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const runInitSpy = vi.fn(async () => ({
      manifestOutcomes: [],
      staleOutcomes: [],
      warnings: [],
    }));
    const fileCfg = normalizeProjectConfig({
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
    const gh = normalizeProjectConfig({
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
    });
    try {
      mkdirSync(join(cwd, ".cursor", "prompts"), { recursive: true });
      const tpl = readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          "..",
          "assets",
          "prompts",
          "project-initialization.md",
        ),
        "utf8",
      );
      const initPrompt = renderWorkflowMarkdownAsset(tpl, fileCfg, {
        kind: "markdown",
        embedInitProjectConfigSnapshot: true,
      });
      writeFileSync(join(cwd, ".cursor", "prompts", "project-initialization.md"), initPrompt);
      writeFileSync(
        join(cwd, ".cursor", "workflow.json"),
        `${JSON.stringify(gh, null, 2)}\n`,
        "utf8",
      );

      const program = createProgram({
        runInit: runInitSpy,
        runInitQuestionnaire: async () => ({
          projectConfig: gh,
          shouldWriteProjectConfig: true,
        }),
        promptProviderTransition: promptTransitionSpy,
        promptGitHubMcpTokenForInit: async () => "unused",
      });
      prepareProgramForTest(program);
      await program.parseAsync(["init", "--cwd", cwd], { from: "user" });
      expect(promptTransitionSpy).toHaveBeenCalledTimes(1);
      expect(runInitSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith("Init cancelled.");
    } finally {
      logSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("reportCliFailure", () => {
  it("prints Error.message to stderr and exits with code 1", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    reportCliFailure(new Error("validation failed"));
    expect(errSpy).toHaveBeenCalledWith("validation failed");
    expect(exitSpy).toHaveBeenCalledWith(1);
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("does not print stderr for CommanderError with exit code 0", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    reportCliFailure(new CommanderError(0, "commander.helpDisplayed", "help text"));
    expect(errSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

/** Mirrors `npm` `.bin` symlinks: `argv[1]` is the link; `import.meta.url` is the real file. */
describe.skipIf(!existsSync(distCliJs))("CLI entry when argv[1] is a symlink", () => {
  it("prints init --help", () => {
    const dir = mkdtempSync(join(tmpdir(), "byrde-cursor-symlink-"));
    try {
      const link = join(dir, "byrde-cursor");
      symlinkSync(distCliJs, link);
      const out = execFileSync(process.execPath, [link, "init", "--help"], {
        encoding: "utf8",
      });
      expect(out).toContain("Usage:");
      expect(out).toContain("init");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
