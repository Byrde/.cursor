import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";
import type { ProviderTransitionAck } from "./domain/provider-transition.js";
import { runInit } from "./api/init.js";
import {
  promptGitHubMcpTokenForInit,
  runInitQuestionnaire,
} from "./infrastructure/init-questionnaire.js";
import { loadProjectConfig } from "./infrastructure/project-config-store.js";
import {
  classifyDetectedProjectSetup,
  compareDetectedSetupToTarget,
  inspectProjectInitState,
} from "./infrastructure/project-init-state.js";
import { promptProviderTransition } from "./infrastructure/provider-transition-prompt.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export interface InitOptions {
  cwd: string;
  skipMcp: boolean;
  force: boolean;
  verbose: boolean;
  skipAgent: boolean;
}

function readPackageVersion(): string {
  const pkgPath = path.join(packageRoot, "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { version: string };
  return pkg.version;
}

const packageVersion = readPackageVersion();

export interface CliDependencies {
  readonly runInit?: typeof runInit;
  readonly runInitQuestionnaire?: typeof runInitQuestionnaire;
  readonly promptProviderTransition?: typeof promptProviderTransition;
  readonly promptGitHubMcpTokenForInit?: typeof promptGitHubMcpTokenForInit;
}

export function createProgram(deps: CliDependencies = {}): Command {
  const runInitCommand = deps.runInit ?? runInit;
  const runQuestionnaire = deps.runInitQuestionnaire ?? runInitQuestionnaire;
  const runPromptTransition =
    deps.promptProviderTransition ?? promptProviderTransition;
  const runPromptGitHubToken =
    deps.promptGitHubMcpTokenForInit ?? promptGitHubMcpTokenForInit;
  const program = new Command();
  program
    .name("byrde-cursor")
    .description("Byrde Cursor workflow CLI and assets")
    .version(packageVersion);

  program
    .command("init")
    .description("Interactively configure and install the workflow into the target project")
    .option(
      "--cwd <path>",
      "target working directory",
      process.cwd(),
    )
    .option("--skip-mcp", "skip GitHub MCP setup", false)
    .option(
      "--skip-agent",
      "do not launch the Cursor agent CLI after install (CI/non-interactive)",
      false,
    )
    .option("--force", "overwrite managed files when needed", false)
    .option("--verbose", "print extra diagnostics", false)
    .action(async (options: InitOptions) => {
      const inspection = inspectProjectInitState(options.cwd);
      const questionnaire = await runQuestionnaire({
        cwd: options.cwd,
        existingConfig:
          inspection.resolvedInstalledConfig ?? loadProjectConfig(options.cwd),
      });

      const targetConfig = questionnaire.projectConfig;
      const classified = classifyDetectedProjectSetup(inspection);
      const relation = compareDetectedSetupToTarget(classified, targetConfig);

      let effectiveConfig = targetConfig;
      let providerTransitionAck: ProviderTransitionAck | undefined;

      if (relation !== "matches_target") {
        const tr = await runPromptTransition({
          classified,
          targetFromQuestionnaire: targetConfig,
        });
        if (tr.kind === "cancel") {
          console.log("Init cancelled.");
          return;
        }
        effectiveConfig = tr.effectiveConfig;
        providerTransitionAck = {
          kind: tr.kind,
          effectiveConfig: tr.effectiveConfig,
        };
      }

      let githubMcpToken: string | undefined;
      if (effectiveConfig.backlog.provider === "github-issues" && !options.skipMcp) {
        githubMcpToken = await runPromptGitHubToken();
      }

      const overwriteProjectConfig =
        questionnaire.shouldWriteProjectConfig || providerTransitionAck !== undefined;

      await runInitCommand(
        {
          cwd: options.cwd,
          skipMcp: options.skipMcp,
          verbose: options.verbose,
          force: options.force,
          packageVersion,
          projectConfig: effectiveConfig,
          overwriteProjectConfig,
          githubMcpToken,
          providerTransitionAck,
          skipAgent: options.skipAgent,
        },
        packageRoot,
      );
    });

  return program;
}

function isExecutedAsCli(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const modulePath = realpathSync(fileURLToPath(import.meta.url));
    const argvPath = realpathSync(path.resolve(entry));
    return modulePath === argvPath;
  } catch {
    return false;
  }
}

/** Exported for tests; prints a short message and exits (no stack traces). */
export function reportCliFailure(err: unknown): never {
  if (err instanceof CommanderError) {
    const code = err.exitCode ?? 1;
    if (code !== 0) {
      console.error(err.message);
    }
    process.exit(code);
  } else if (err instanceof Error) {
    console.error(err.message);
    process.exit(1);
  } else {
    console.error(String(err));
    process.exit(1);
  }
}

if (isExecutedAsCli()) {
  void createProgram().parseAsync(process.argv).catch(reportCliFailure);
}
