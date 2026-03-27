import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  createDefaultProjectConfig,
  normalizeProjectConfig,
  type ProjectConfig,
} from "../domain/config.js";
import type { ManagedState } from "../domain/managed-state.js";
import { readManagedGitHubMcpSignal } from "./github-mcp-store.js";
import { readInitSession, type InitSessionRecord } from "./init-session-store.js";
import { loadManagedState } from "./managed-state-store.js";
import { loadProjectConfig } from "./project-config-store.js";

/** Relative to `<cwd>/.cursor/` — normal interactive init agent prompt. */
export const PROJECT_INIT_PROMPT_ASSET_TARGET = "prompts/project-initialization.md";
/** Relative to `<cwd>/.cursor/` — one-off migration after provider transition. */
export const PROJECT_MIGRATION_PROMPT_ASSET_TARGET = "prompts/project-migration.md";
/**
 * @deprecated Prefer `PROJECT_INIT_PROMPT_ASSET_TARGET`. Same value; older installs used `init/project-initialization.md` on disk (still read for snapshots).
 */
export const INIT_PROMPT_ASSET_TARGET = PROJECT_INIT_PROMPT_ASSET_TARGET;

/** Legacy install path (pre-`prompts/`); still read for embedded snapshot compatibility. */
const LEGACY_INIT_PROMPT_ASSET_TARGET = "init/project-initialization.md";

const PROMPT_SNAPSHOT_SEARCH_PATHS: readonly string[] = [
  PROJECT_INIT_PROMPT_ASSET_TARGET,
  PROJECT_MIGRATION_PROMPT_ASSET_TARGET,
  LEGACY_INIT_PROMPT_ASSET_TARGET,
];

const INSTALLED_PROJECT_CONFIG_SNAPSHOT_RE =
  /<!--\s*byrde:installed-project-config v1\s*\n([\s\S]*?)\n-->/;

function readEmbeddedProjectConfigFromInstalledPrompts(
  cwd: string,
): ProjectConfig | undefined {
  for (const rel of PROMPT_SNAPSHOT_SEARCH_PATHS) {
    const p = path.join(cwd, ".cursor", rel);
    if (!existsSync(p)) continue;
    const snap = parseProjectConfigSnapshotFromPromptMarkdown(readFileSync(p, "utf8"));
    if (snap) return snap;
  }
  return undefined;
}

/**
 * Reads normalized `ProjectConfig` embedded at install time in rendered
 * `.cursor/prompts/*.md` (base64 JSON). Used by the CLI only.
 */
export function parseProjectConfigSnapshotFromPromptMarkdown(
  markdown: string,
): ProjectConfig | undefined {
  const m = markdown.match(INSTALLED_PROJECT_CONFIG_SNAPSHOT_RE);
  if (!m?.[1]) {
    return undefined;
  }
  try {
    const json = Buffer.from(m[1].trim(), "base64").toString("utf8");
    return normalizeProjectConfig(JSON.parse(json));
  } catch {
    return undefined;
  }
}

/** @deprecated Use `parseProjectConfigSnapshotFromPromptMarkdown`. */
export const parseProjectConfigSnapshotFromInitPromptMarkdown =
  parseProjectConfigSnapshotFromPromptMarkdown;

/**
 * Resolves workflow settings for CLI init checks without relying on the current
 * questionnaire run: prefers baked snapshot in installed prompt markdown, then
 * persisted `.cursor/workflow.json`.
 */
export function loadProjectConfigForInitCliChecks(
  cwd: string,
): ProjectConfig | undefined {
  const snap = readEmbeddedProjectConfigFromInstalledPrompts(cwd);
  if (snap) {
    return snap;
  }
  return loadProjectConfig(cwd);
}

export type ProjectInitializationPhase =
  | "already_initialized"
  | "needs_initialization"
  | "incomplete_previous_init";

/** Exported for tests — detects scaffold `docs/overview.md` from init. */
export function isOverviewInTemplateMode(content: string): boolean {
  const firstLine =
    content.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  return firstLine.includes("[Project Name]");
}

/** Exported for tests — detects scaffold `docs/design.md` from init. */
export function isDesignInTemplateMode(content: string): boolean {
  return (
    /\*\*\[Term\]\*\*/.test(content) &&
    /\[Definition of the term within this specific domain\.\]/.test(content)
  );
}

/**
 * True when the markdown backlog still contains shipped placeholder **table** rows.
 * Only table lines (`|...|`) are considered so prose mentioning these strings does not false-positive.
 */
export function isFileBacklogPlaceholderOnly(content: string): boolean {
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|[\s\-:|]+\|\s*$/.test(t)) continue;
    if (
      /\[Epic from Key Features\]/.test(line) ||
      /\[Task Title or User Story\]/.test(line)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * CLI-side initialization check (no TypeScript `BacklogProvider`).
 * **Initialized** means substantive `docs/overview.md` and `docs/design.md`, plus a coherent
 * local setup for the selected provider. File-backed mode requires the configured backlog file to
 * exist; legacy placeholder-only tables (old installs) stay incomplete until replaced.
 * GitHub Project mode does **not** require a populated remote backlog.
 */
export function isProjectInitialized(
  cwd: string,
  config: ProjectConfig,
): boolean {
  const overviewPath = path.join(cwd, "docs", "overview.md");
  const designPath = path.join(cwd, "docs", "design.md");
  if (!existsSync(overviewPath) || !existsSync(designPath)) {
    return false;
  }
  const overview = readFileSync(overviewPath, "utf8");
  const design = readFileSync(designPath, "utf8");
  if (isOverviewInTemplateMode(overview) || isDesignInTemplateMode(design)) {
    return false;
  }
  if (config.backlog.provider === "file") {
    const rel = config.backlog.file!.path;
    const backlogPath = path.join(cwd, rel);
    if (!existsSync(backlogPath)) {
      return false;
    }
    const backlog = readFileSync(backlogPath, "utf8");
    if (isFileBacklogPlaceholderOnly(backlog)) {
      return false;
    }
    return true;
  }
  if (config.backlog.provider === "github-issues") {
    return true;
  }
  return true;
}

export function getProjectInitializationPhase(
  cwd: string,
  config: ProjectConfig,
  session?: InitSessionRecord,
): ProjectInitializationPhase {
  if (isProjectInitialized(cwd, config)) {
    return "already_initialized";
  }
  const s = session ?? readInitSession(cwd);
  if (s?.agentLaunchedAt) {
    return "incomplete_previous_init";
  }
  return "needs_initialization";
}

// --- Task 025: inspect / classify / compare (before mutating project state) ---

export interface ProjectInitInspection {
  readonly cwd: string;
  readonly embeddedConfigSnapshot: ProjectConfig | undefined;
  readonly persistedConfig: ProjectConfig | undefined;
  /** Prefer snapshot in init prompt, else persisted `workflow.json`. */
  readonly resolvedInstalledConfig: ProjectConfig | undefined;
  /** True when both embedded snapshot and persisted workflow exist and normalize differently. */
  readonly configSnapshotMismatch: boolean;
  readonly docs: {
    readonly overviewPath: string;
    readonly designPath: string;
    readonly overviewExists: boolean;
    readonly designExists: boolean;
    readonly overviewTemplate: boolean;
    readonly designTemplate: boolean;
  };
  readonly fileBacklog: {
    readonly configuredPath: string;
    readonly exists: boolean;
    readonly placeholderOnly: boolean;
  };
  readonly initSession: InitSessionRecord | undefined;
  readonly managedState: ManagedState | null;
  readonly managedGitHubMcp: {
    readonly present: boolean;
    readonly serverKeys: readonly string[];
  };
}

function configsEqual(a: ProjectConfig, b: ProjectConfig): boolean {
  return JSON.stringify(normalizeProjectConfig(a)) === JSON.stringify(normalizeProjectConfig(b));
}

function resolvePrimaryFileBacklogPath(
  resolved: ProjectConfig | undefined,
  persisted: ProjectConfig | undefined,
): string {
  if (resolved?.backlog.provider === "file") {
    return resolved.backlog.file!.path;
  }
  if (persisted?.backlog.provider === "file") {
    return persisted.backlog.file!.path;
  }
  return createDefaultProjectConfig().backlog.file!.path;
}

/**
 * Read-only aggregation of local init-related state (no writes).
 */
export function inspectProjectInitState(cwd: string): ProjectInitInspection {
  const embeddedConfigSnapshot = readEmbeddedProjectConfigFromInstalledPrompts(cwd);
  const persistedConfig = loadProjectConfig(cwd);
  const resolvedInstalledConfig = loadProjectConfigForInitCliChecks(cwd);

  const configSnapshotMismatch = Boolean(
    embeddedConfigSnapshot &&
      persistedConfig &&
      !configsEqual(embeddedConfigSnapshot, persistedConfig),
  );

  const overviewPath = path.join(cwd, "docs", "overview.md");
  const designPath = path.join(cwd, "docs", "design.md");
  const overviewExists = existsSync(overviewPath);
  const designExists = existsSync(designPath);
  let overviewTemplate = false;
  let designTemplate = false;
  if (overviewExists) {
    overviewTemplate = isOverviewInTemplateMode(readFileSync(overviewPath, "utf8"));
  }
  if (designExists) {
    designTemplate = isDesignInTemplateMode(readFileSync(designPath, "utf8"));
  }

  const configuredPath = resolvePrimaryFileBacklogPath(
    resolvedInstalledConfig,
    persistedConfig,
  );
  const backlogAbs = path.join(cwd, configuredPath);
  const backlogExists = existsSync(backlogAbs);
  let placeholderOnly = false;
  if (backlogExists) {
    placeholderOnly = isFileBacklogPlaceholderOnly(readFileSync(backlogAbs, "utf8"));
  }

  const cursorDir = path.join(cwd, ".cursor");
  const managedState = loadManagedState(cursorDir);
  const mcp = readManagedGitHubMcpSignal(cwd);

  return {
    cwd,
    embeddedConfigSnapshot,
    persistedConfig,
    resolvedInstalledConfig,
    configSnapshotMismatch,
    docs: {
      overviewPath,
      designPath,
      overviewExists,
      designExists,
      overviewTemplate,
      designTemplate,
    },
    fileBacklog: {
      configuredPath,
      exists: backlogExists,
      placeholderOnly,
    },
    initSession: readInitSession(cwd),
    managedState,
    managedGitHubMcp: { present: mcp.present, serverKeys: mcp.serverKeys },
  };
}

export type DetectedProjectSetupKind =
  | "template_uninitialized"
  | "scaffolded_file"
  | "scaffolded_github"
  | "mixed_ambiguous";

export interface ClassifiedProjectSetup {
  readonly kind: DetectedProjectSetupKind;
  readonly evidence: {
    readonly fileSignals: readonly string[];
    readonly githubSignals: readonly string[];
    readonly conflictSignals: readonly string[];
  };
  readonly bestResolvedInstalledConfig: ProjectConfig | undefined;
}

export function classifyDetectedProjectSetup(
  inspection: ProjectInitInspection,
): ClassifiedProjectSetup {
  const fileSignals: string[] = [];
  const githubSignals: string[] = [];
  const conflictSignals: string[] = [];

  const { persistedConfig, embeddedConfigSnapshot, resolvedInstalledConfig } = inspection;

  if (persistedConfig?.backlog.provider === "file") {
    fileSignals.push("persisted_workflow_file_provider");
  }
  if (persistedConfig?.backlog.provider === "github-issues") {
    githubSignals.push("persisted_workflow_github_provider");
  }
  if (embeddedConfigSnapshot?.backlog.provider === "file") {
    fileSignals.push("embedded_snapshot_file_provider");
  }
  if (embeddedConfigSnapshot?.backlog.provider === "github-issues") {
    githubSignals.push("embedded_snapshot_github_provider");
  }

  if (embeddedConfigSnapshot && persistedConfig) {
    const ep = normalizeProjectConfig(embeddedConfigSnapshot).backlog.provider;
    const pp = normalizeProjectConfig(persistedConfig).backlog.provider;
    if (ep !== pp) {
      conflictSignals.push("embedded_vs_persisted_provider_mismatch");
    }
  }

  if (inspection.fileBacklog.exists && !inspection.fileBacklog.placeholderOnly) {
    fileSignals.push("populated_local_file_backlog");
  }
  if (inspection.fileBacklog.exists && inspection.fileBacklog.placeholderOnly) {
    fileSignals.push("placeholder_local_file_backlog");
  }

  if (inspection.managedGitHubMcp.present) {
    githubSignals.push("managed_github_mcp_server");
  }
  if (inspection.initSession?.agentLaunchedAt) {
    fileSignals.push("init_session_agent_launched");
  }

  const rp = resolvedInstalledConfig?.backlog.provider;
  if (rp === "github-issues" && fileSignals.includes("populated_local_file_backlog")) {
    conflictSignals.push("resolved_github_config_with_populated_file_backlog");
  }

  const fileStrong =
    fileSignals.includes("persisted_workflow_file_provider") ||
    fileSignals.includes("embedded_snapshot_file_provider") ||
    fileSignals.includes("populated_local_file_backlog");

  const githubStrong =
    githubSignals.includes("persisted_workflow_github_provider") ||
    githubSignals.includes("embedded_snapshot_github_provider") ||
    githubSignals.includes("managed_github_mcp_server");

  if (conflictSignals.length > 0) {
    return {
      kind: "mixed_ambiguous",
      evidence: { fileSignals, githubSignals, conflictSignals },
      bestResolvedInstalledConfig: resolvedInstalledConfig,
    };
  }

  if (fileStrong && githubStrong) {
    return {
      kind: "mixed_ambiguous",
      evidence: {
        fileSignals,
        githubSignals,
        conflictSignals: [...conflictSignals, "both_file_and_github_signals"],
      },
      bestResolvedInstalledConfig: resolvedInstalledConfig,
    };
  }

  if (fileStrong) {
    return {
      kind: "scaffolded_file",
      evidence: { fileSignals, githubSignals, conflictSignals },
      bestResolvedInstalledConfig: resolvedInstalledConfig,
    };
  }

  if (githubStrong) {
    return {
      kind: "scaffolded_github",
      evidence: { fileSignals, githubSignals, conflictSignals },
      bestResolvedInstalledConfig: resolvedInstalledConfig,
    };
  }

  return {
    kind: "template_uninitialized",
    evidence: { fileSignals, githubSignals, conflictSignals },
    bestResolvedInstalledConfig: resolvedInstalledConfig,
  };
}

export type SetupTargetRelation = "matches_target" | "different_setup" | "ambiguous";

export function compareDetectedSetupToTarget(
  classified: ClassifiedProjectSetup,
  targetConfig: ProjectConfig,
): SetupTargetRelation {
  const target = normalizeProjectConfig(targetConfig);

  if (classified.kind === "mixed_ambiguous") {
    return "ambiguous";
  }
  if (classified.kind === "template_uninitialized") {
    return "matches_target";
  }

  const detected = classified.bestResolvedInstalledConfig;

  if (classified.kind === "scaffolded_file") {
    if (target.backlog.provider !== "file") {
      return "different_setup";
    }
    if (!detected || detected.backlog.provider !== "file") {
      return "ambiguous";
    }
    const tp = target.backlog.file!.path;
    const dp = detected.backlog.file!.path;
    return tp === dp ? "matches_target" : "different_setup";
  }

  if (classified.kind === "scaffolded_github") {
    if (target.backlog.provider !== "github-issues") {
      return "different_setup";
    }
    if (!detected || detected.backlog.provider !== "github-issues") {
      return "ambiguous";
    }
    const tg = target.backlog["github-issues"]!;
    const dg = detected.backlog["github-issues"]!;
    const same =
      tg.repository === dg.repository && tg.projectNumber === dg.projectNumber;
    return same ? "matches_target" : "different_setup";
  }

  return "ambiguous";
}
