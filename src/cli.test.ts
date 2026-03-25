import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { CommanderError, type Command } from "commander";
import { createDefaultWorkflowModels } from "./domain/config.js";
import { createProgram, reportCliFailure } from "./cli.js";

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
            architectReview: "required",
            testing: "required",
          },
          models: createDefaultWorkflowModels(),
        },
      },
      shouldWriteProjectConfig: true,
      githubMcpToken: undefined,
    }),
    runInit: async () => {
      // No-op for parser/help tests.
      return {
        manifestOutcomes: [],
        staleOutcomes: [],
        warnings: [],
      };
    },
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
            architectReview: "required" as const,
            testing: "required" as const,
          },
          models: createDefaultWorkflowModels(),
        },
      },
      shouldWriteProjectConfig: true,
      githubMcpToken: undefined,
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
      force: false,
      verbose: false,
    });
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
            architectReview: "optional" as const,
            testing: "optional" as const,
          },
          models: createDefaultWorkflowModels(),
        },
      },
      shouldWriteProjectConfig: true,
      githubMcpToken: "ghp_secret",
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
        "--force",
        "--verbose",
      ],
      { from: "user" },
    );
    const initCmd = program.commands.find((c) => c.name() === "init");
    expect(initCmd!.opts()).toEqual({
      cwd,
      skipMcp: true,
      force: true,
      verbose: true,
    });
    expect(runInitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd,
        skipMcp: true,
        force: true,
        verbose: true,
        overwriteProjectConfig: true,
        githubMcpToken: "ghp_secret",
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
