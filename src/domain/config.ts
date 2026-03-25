export const PROJECT_CONFIG_FILENAME = "workflow.json";

export type BacklogProviderKind = "file" | "github-issues";
export type WorkflowDefaultMode = "required" | "optional";

/** Subagent roles with configurable Cursor model ids (see `assets/agents/*.md`). */
export type WorkflowModelRole =
  | "planner"
  | "architect"
  | "developer"
  | "tester";

export interface WorkflowModels {
  readonly planner: string;
  readonly architect: string;
  readonly developer: string;
  readonly tester: string;
}

/**
 * GitHub backlog mode uses provider key `github-issues` (legacy name) and is
 * GitHub Project v2–first: issues are ordered by the Project **Priority** field,
 * workflow state by the Project **Status** field, and **milestones** represent epics.
 */
export interface GitHubIssuesBacklogConfig {
  readonly repository: string;
  /** GitHub Project (v2) number as shown on the repository Projects tab. */
  readonly projectNumber: number;
  /**
   * Organization or user login that owns the project. When omitted, tooling
   * assumes the repository owner (the segment before `/` in `repository`).
   */
  readonly projectOwner?: string;
  /** Project field name used for backlog ordering (default `Priority`). */
  readonly priorityField: string;
  /** Project field name used for workflow status (default `Status`). */
  readonly statusField: string;
  /**
   * Optional issue label filter (secondary to Project membership). Omit or leave
   * empty when everything is driven from the Project.
   */
  readonly label?: string;
  readonly mcpServerName: string;
}

export interface ProjectConfig {
  readonly backlog: {
    readonly provider: BacklogProviderKind;
    readonly file?: {
      readonly path: string;
    };
    readonly "github-issues"?: GitHubIssuesBacklogConfig;
  };
  readonly workflow: {
    readonly defaults: {
      readonly architectReview: WorkflowDefaultMode;
      readonly testing: WorkflowDefaultMode;
    };
    readonly models: WorkflowModels;
  };
}

/** Defaults match pre-template agent frontmatter in `assets/agents/`. */
export function createDefaultWorkflowModels(): WorkflowModels {
  return {
    planner: "gpt-5.4-high",
    architect: "gpt-5.4-high",
    developer: "composer-2-fast",
    tester: "composer-2-fast",
  };
}

export function createDefaultProjectConfig(): ProjectConfig {
  return {
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
  };
}

export const DEFAULT_PROJECT_CONFIG = createDefaultProjectConfig();

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeBacklog(
  raw: unknown,
  base: ProjectConfig["backlog"],
): ProjectConfig["backlog"] {
  if (!raw || typeof raw !== "object") {
    return base;
  }
  const b = raw as Record<string, unknown>;
  const provider =
    b.provider === "github-issues" || b.provider === "file"
      ? b.provider
      : base.provider;

  if (provider === "file") {
    const fileRaw = b.file;
    const pathFrom =
      fileRaw && typeof fileRaw === "object" &&
        isNonEmptyString((fileRaw as Record<string, unknown>).path)
        ? String((fileRaw as Record<string, unknown>).path).trim()
        : base.file!.path;
    return { provider: "file", file: { path: pathFrom } };
  }

  const ghRaw = b["github-issues"];
  const githubOptionalDefaults = {
    priorityField: "Priority",
    statusField: "Status",
    mcpServerName: "github",
  } as const;

  function parsePositiveInt(v: unknown): number | undefined {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      return Math.trunc(v);
    }
    if (isNonEmptyString(v)) {
      const n = Number.parseInt(String(v).trim(), 10);
      if (Number.isFinite(n) && n > 0) {
        return n;
      }
    }
    return undefined;
  }

  /**
   * GitHub mode requires an explicit repository and project number. Missing or
   * invalid nested config falls back to the default file backlog so we never
   * invent a plausible-looking `owner/repo` + `projectNumber: 1` target.
   */
  if (ghRaw && typeof ghRaw === "object") {
    const g = ghRaw as Record<string, unknown>;
    const repository = isNonEmptyString(g.repository)
      ? g.repository.trim()
      : undefined;
    const projectNumber = parsePositiveInt(g.projectNumber);

    if (repository !== undefined && projectNumber !== undefined) {
      const priorityField = isNonEmptyString(g.priorityField)
        ? g.priorityField.trim()
        : githubOptionalDefaults.priorityField;
      const statusField = isNonEmptyString(g.statusField)
        ? g.statusField.trim()
        : githubOptionalDefaults.statusField;
      const labelRaw = g.label;
      const label =
        isNonEmptyString(labelRaw) ? labelRaw.trim() : undefined;

      return {
        provider: "github-issues",
        "github-issues": {
          repository,
          projectNumber,
          projectOwner: isNonEmptyString(g.projectOwner)
            ? g.projectOwner.trim()
            : undefined,
          priorityField,
          statusField,
          ...(label !== undefined ? { label } : {}),
          mcpServerName: isNonEmptyString(g.mcpServerName)
            ? g.mcpServerName.trim()
            : githubOptionalDefaults.mcpServerName,
        },
      };
    }
  }

  return base;
}

function normalizeWorkflow(
  raw: unknown,
  base: ProjectConfig["workflow"],
): ProjectConfig["workflow"] {
  const models = { ...base.models };
  let architectReview = base.defaults.architectReview;
  let testing = base.defaults.testing;

  if (raw && typeof raw === "object") {
    const w = raw as Record<string, unknown>;
    const d = w.defaults;
    if (d && typeof d === "object") {
      const def = d as Record<string, unknown>;
      if (def.architectReview === "required" || def.architectReview === "optional") {
        architectReview = def.architectReview;
      }
      if (def.testing === "required" || def.testing === "optional") {
        testing = def.testing;
      }
    }
    const m = w.models;
    if (m && typeof m === "object") {
      const mo = m as Record<string, unknown>;
      const pick = (key: keyof WorkflowModels): string => {
        const v = mo[key];
        return isNonEmptyString(v) ? v.trim() : base.models[key];
      };
      models.planner = pick("planner");
      models.architect = pick("architect");
      models.developer = pick("developer");
      models.tester = pick("tester");
    }
  }

  return {
    defaults: { architectReview, testing },
    models,
  };
}

/**
 * Merges parsed JSON with defaults so older configs without `workflow.models`
 * (or partial fields) remain valid.
 */
export function normalizeProjectConfig(raw: unknown): ProjectConfig {
  const base = createDefaultProjectConfig();
  if (!raw || typeof raw !== "object") {
    return base;
  }

  const o = raw as Record<string, unknown>;
  return {
    backlog: normalizeBacklog(o.backlog, base.backlog),
    workflow: normalizeWorkflow(o.workflow, base.workflow),
  };
}
