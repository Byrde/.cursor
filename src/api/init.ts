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
import { writeGitHubMcpServer } from "../infrastructure/github-mcp-store.js";

export type { InstallReconcileResult };

export interface InitParams {
  cwd: string;
  skipMcp: boolean;
  verbose: boolean;
  force: boolean;
  packageVersion: string;
  projectConfig?: ProjectConfig;
  overwriteProjectConfig?: boolean;
  githubMcpToken?: string;
}

export async function runInit(
  params: InitParams,
  packageRoot: string,
): Promise<InstallReconcileResult> {
  const targetDir = path.join(params.cwd, ".cursor");
  const projectConfig = normalizeProjectConfig(
    params.projectConfig ?? DEFAULT_PROJECT_CONFIG,
  );
  const result = installAssets(DEFAULT_MANIFEST, packageRoot, targetDir, {
    force: params.force,
    packageVersion: params.packageVersion,
    projectConfig,
  });
  const warnings = [...result.warnings];

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

  for (const w of warnings) {
    console.warn(w);
  }

  if (params.verbose) {
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
