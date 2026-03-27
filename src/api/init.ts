import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_PROJECT_CONFIG,
  normalizeProjectConfig,
  type ProjectConfig,
} from "../domain/config.js";
import { DEFAULT_MANIFEST } from "../domain/asset-manifest.js";
import {
  installAssets,
  type InstallReconcileResult,
} from "../infrastructure/file-installer.js";
import { validateInstalledPackageOutputs } from "../infrastructure/install-output-validator.js";
import { scaffoldTemplateDocs } from "../infrastructure/doc-template-installer.js";
import {
  ensureProjectConfig,
  saveProjectConfig,
} from "../infrastructure/project-config-store.js";
import {
  ProviderTransitionRequiredError,
  type ProviderTransitionAck,
} from "../domain/provider-transition.js";

export type { ProviderTransitionAck };
export { ProviderTransitionRequiredError };
import {
  removeManagedGitHubMcpServers,
  writeGitHubMcpServer,
} from "../infrastructure/github-mcp-store.js";
import { launchCursorAgentSession } from "../infrastructure/cursor-agent-launcher.js";
import {
  clearInitSession,
  writeInitSession,
} from "../infrastructure/init-session-store.js";
import {
  classifyDetectedProjectSetup,
  compareDetectedSetupToTarget,
  getProjectInitializationPhase,
  inspectProjectInitState,
  PROJECT_INIT_PROMPT_ASSET_TARGET,
  PROJECT_MIGRATION_PROMPT_ASSET_TARGET,
  type ProjectInitInspection,
} from "../infrastructure/project-init-state.js";

export type { InstallReconcileResult };

const LEGACY_INIT_COMPLETION_BASENAME = "byrde-init-completion.json";

/** Best-effort removal of obsolete init marker files left from older installers. */
function removeLegacyInitCompletionFileIfPresent(cwd: string): void {
  const p = path.join(cwd, ".cursor", LEGACY_INIT_COMPLETION_BASENAME);
  if (!existsSync(p)) {
    return;
  }
  try {
    unlinkSync(p);
  } catch {
    // ignore cleanup failures
  }
}

export interface InitParams {
  cwd: string;
  skipMcp: boolean;
  verbose: boolean;
  force: boolean;
  packageVersion: string;
  projectConfig?: ProjectConfig;
  overwriteProjectConfig?: boolean;
  githubMcpToken?: string;
  /**
   * Required when the inspected project does not match `projectConfig` for
   * provider-affecting setup (see `compareDetectedSetupToTarget`).
   */
  providerTransitionAck?: ProviderTransitionAck;
  /** When true, skips spawning the Cursor `agent` CLI (tests and non-interactive CI). */
  skipAgent?: boolean;
  /** Injected for tests; defaults to `launchCursorAgentSession`. */
  launchAgentSession?: typeof launchCursorAgentSession;
}

function configsJsonEqual(a: ProjectConfig, b: ProjectConfig): boolean {
  return (
    JSON.stringify(normalizeProjectConfig(a)) ===
    JSON.stringify(normalizeProjectConfig(b))
  );
}

function githubSignalsInInspection(inspection: ProjectInitInspection): boolean {
  return (
    inspection.managedGitHubMcp.present ||
    inspection.embeddedConfigSnapshot?.backlog.provider === "github-issues" ||
    inspection.resolvedInstalledConfig?.backlog.provider === "github-issues" ||
    inspection.persistedConfig?.backlog.provider === "github-issues"
  );
}

function applyGithubToFileTransitionCleanup(
  cwd: string,
  inspection: ProjectInitInspection,
  effective: ProjectConfig,
): void {
  if (effective.backlog.provider !== "file") {
    return;
  }
  if (!githubSignalsInInspection(inspection)) {
    return;
  }
  removeManagedGitHubMcpServers(cwd);
  removeLegacyInitCompletionFileIfPresent(cwd);
}

export async function runInit(
  params: InitParams,
  packageRoot: string,
): Promise<InstallReconcileResult> {
  const projectConfig = normalizeProjectConfig(
    params.projectConfig ?? DEFAULT_PROJECT_CONFIG,
  );
  const inspection = inspectProjectInitState(params.cwd);
  const classified = classifyDetectedProjectSetup(inspection);
  const setupRelation = compareDetectedSetupToTarget(classified, projectConfig);

  if (setupRelation !== "matches_target") {
    if (!params.providerTransitionAck) {
      throw new ProviderTransitionRequiredError(
        "Provider setup mismatch detected without a confirmed transition decision. Run `npx @byrde/cursor init` interactively to resolve file vs GitHub backlog setup.",
      );
    }
    if (!configsJsonEqual(params.providerTransitionAck.effectiveConfig, projectConfig)) {
      throw new ProviderTransitionRequiredError(
        "Provider transition acknowledgement does not match the project config passed to init.",
      );
    }
  }

  applyGithubToFileTransitionCleanup(params.cwd, inspection, projectConfig);

  const preWarnings: string[] = [];

  const targetDir = path.join(params.cwd, ".cursor");
  const result = installAssets(DEFAULT_MANIFEST, packageRoot, targetDir, {
    force: params.force,
    packageVersion: params.packageVersion,
    projectConfig,
  });
  const warnings = [...preWarnings, ...result.warnings];

  validateInstalledPackageOutputs(params.cwd, result.manifestOutcomes);
  const configResult = params.overwriteProjectConfig
    ? saveProjectConfig(params.cwd, projectConfig)
    : ensureProjectConfig(params.cwd, projectConfig);
  const docsResult = scaffoldTemplateDocs(packageRoot, params.cwd, projectConfig);
  const shouldConfigureGitHubMcp = projectConfig.backlog.provider === "github-issues";
  let mcpLabel: string | undefined;
  if (shouldConfigureGitHubMcp && !params.skipMcp) {
    const token = params.githubMcpToken;
    if (!token) {
      warnings.push(
        "GitHub backlog selected, but no GitHub token was provided for Cursor MCP setup. Re-run `init` or edit `.cursor/mcp.json` manually.",
      );
    } else {
      const mcpResult = writeGitHubMcpServer({
        cwd: params.cwd,
        serverName: projectConfig.backlog["github-issues"]?.mcpServerName ?? "github",
        token,
      });
      mcpLabel = `${mcpResult.created ? "GitHub MCP config created" : "GitHub MCP config updated"}: ${mcpResult.path}`;
    }
  } else if (shouldConfigureGitHubMcp) {
    mcpLabel = "Skipped GitHub MCP setup (--skip-mcp).";
  } else {
    mcpLabel = "No GitHub MCP setup needed for the selected backlog.";
  }

  console.log("Project scaffolded.");

  const warnCountBeforeAgent = warnings.length;
  for (let i = 0; i < warnCountBeforeAgent; i++) {
    console.warn(warnings[i]!);
  }

  const launcher = params.launchAgentSession ?? launchCursorAgentSession;
  const isMigrationSession =
    params.providerTransitionAck?.kind === "transition";
  const agentPromptRelative = isMigrationSession
    ? PROJECT_MIGRATION_PROMPT_ASSET_TARGET
    : PROJECT_INIT_PROMPT_ASSET_TARGET;
  const agentPromptPath = path.join(params.cwd, ".cursor", agentPromptRelative);

  if (!params.skipAgent) {
    const phase = getProjectInitializationPhase(params.cwd, projectConfig);
    const skipAgentLaunch =
      phase === "already_initialized" && !isMigrationSession;
    if (skipAgentLaunch) {
      clearInitSession(params.cwd);
      console.log(
        "Project is already initialized (substantive overview and design; coherent workflow setup). Skipping the interactive Cursor agent session.",
      );
    } else {
      if (isMigrationSession) {
        if (phase === "incomplete_previous_init") {
          console.log(
            "Previous setup reconciliation did not finish. Launching the Cursor agent session again (same workspace). Follow the reconciliation prompt to align the repo with your selected setup; defer full backlog planning unless you explicitly ask.",
          );
        } else {
          console.log(
            "Launching the Cursor agent CLI for a one-time setup reconciliation session. The agent will use the reconciliation prompt to align paths, tooling, and docs with your selected setup. Exit the agent when done.",
          );
        }
      } else if (phase === "incomplete_previous_init") {
        console.log(
          "Previous initialization did not finish. Launching the Cursor agent session again (same workspace). The agent will ask a few setup and vision questions first, then help you complete substantive docs/overview.md and docs/design.md. Backlog planning stays out of init—defer it until you explicitly ask for planning or feature work.",
        );
      } else {
        console.log(
          "Launching the Cursor agent CLI for interactive project initialization. The agent will ask a few setup and vision questions first, then help you complete substantive overview and design docs. Backlog planning is deferred until you explicitly ask for planning or feature work. Exit the agent when done.",
        );
      }

      if (!existsSync(agentPromptPath)) {
        const label = isMigrationSession ? "reconciliation" : "initialization";
        warnings.push(
          `Missing ${label} prompt at ${agentPromptPath}; cannot launch Cursor agent. Complete ${label} manually using your editor and workflow rules.`,
        );
      } else {
        const initialPrompt = readFileSync(agentPromptPath, "utf8");
        const agentResult = await launcher(params.cwd, initialPrompt);
        if (agentResult.errorMessage) {
          warnings.push(agentResult.errorMessage);
        } else {
          writeInitSession(params.cwd, {
            agentLaunchedAt: new Date().toISOString(),
            packageVersion: params.packageVersion,
          });
        }
      }
    }
  }

  for (let i = warnCountBeforeAgent; i < warnings.length; i++) {
    console.warn(warnings[i]!);
  }

  if (params.verbose) {
    console.log(
      `Init classification: ${classified.kind} (target vs detected: ${setupRelation})`,
    );
    const configLabel = params.overwriteProjectConfig
      ? (configResult.created ? "Project config created" : "Project config updated")
      : (configResult.created ? "Project config created" : "Project config preserved");

    console.log(`${configLabel}: ${configResult.path}`);
    console.log(
      `Docs scaffolded: ${docsResult.created.length} created, ${docsResult.skipped.length} preserved.`,
    );
    console.log(mcpLabel);
    if (configResult.created) {
      console.log(`config created: ${configResult.path}`);
    } else {
      console.log(`config preserved: ${configResult.path}`);
    }
    for (const created of docsResult.created) {
      console.log(`doc created: ${created}`);
    }
    for (const skipped of docsResult.skipped) {
      console.log(`doc preserved: ${skipped}`);
    }
    for (const o of result.manifestOutcomes) {
      const dest = `${o.target} -> ${o.absolutePath}`;
      if (o.kind === "skipped") {
        console.log(`skipped (${o.reason}): ${dest}`);
      } else {
        console.log(`${o.kind}: ${dest}`);
      }
    }
    for (const s of result.staleOutcomes) {
      if (s.kind === "stale_removed") {
        console.log(`stale removed: ${s.target} (${s.absolutePath})`);
      } else if (s.kind === "stale_record_dropped") {
        console.log(`stale record dropped (file missing): ${s.target}`);
      } else {
        console.log(
          `stale kept (${s.reason}): ${s.target} (${s.absolutePath})`,
        );
      }
    }
  }

  return {
    ...result,
    warnings,
  };
}
