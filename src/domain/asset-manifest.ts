import type { WorkflowModelRole } from "./config.js";

/** Install-time template contract for rendered `.cursor` markdown assets. */
export type MarkdownRenderSpec = {
  readonly kind: "markdown";
  readonly agentRole?: WorkflowModelRole;
  /**
   * When true, append a machine-readable base64 JSON snapshot of `ProjectConfig`
   * for CLI init checks when `workflow.json` is absent. Not used by rules at chat time.
   */
  readonly embedInitProjectConfigSnapshot?: boolean;
};

export interface AssetEntry {
  readonly source: string;
  readonly target: string;
  /**
   * When set, `source` is a UTF-8 template expanded at install/sync time
   * (`renderWorkflowMarkdownAsset`).
   */
  readonly render?: MarkdownRenderSpec;
}

/** Maps each shipped file under `assets/` to its path under `<cwd>/.cursor/`. */
export const DEFAULT_MANIFEST = [
  {
    source: "assets/agents/architect-1.md",
    target: "agents/architect-1.md",
    render: { kind: "markdown", agentRole: "architect1" },
  },
  {
    source: "assets/agents/architect-2.md",
    target: "agents/architect-2.md",
    render: { kind: "markdown", agentRole: "architect2" },
  },
  {
    source: "assets/agents/developer.md",
    target: "agents/developer.md",
    render: { kind: "markdown", agentRole: "developer" },
  },
  {
    source: "assets/agents/planner.md",
    target: "agents/planner.md",
    render: { kind: "markdown", agentRole: "planner" },
  },
  {
    source: "assets/agents/tester.md",
    target: "agents/tester.md",
    render: { kind: "markdown", agentRole: "tester" },
  },
  { source: "assets/rules/global.mdc", target: "rules/global.mdc", render: { kind: "markdown" } },
  {
    source: "assets/prompts/project-initialization.md",
    target: "prompts/project-initialization.md",
    render: { kind: "markdown", embedInitProjectConfigSnapshot: true },
  },
  {
    source: "assets/prompts/project-migration.md",
    target: "prompts/project-migration.md",
    render: { kind: "markdown", embedInitProjectConfigSnapshot: true },
  },
  { source: "assets/templates/backlog.md", target: "templates/backlog.md" },
  { source: "assets/templates/design.md", target: "templates/design.md" },
  { source: "assets/templates/overview.md", target: "templates/overview.md" },
  {
    source: "assets/templates/testability/README.md",
    target: "templates/testability/README.md",
  },
  { source: "assets/templates/adr/README.md", target: "templates/adr/README.md" },
] as const satisfies readonly AssetEntry[];
