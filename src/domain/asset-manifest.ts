import type { WorkflowModelRole } from "./config.js";

export interface AssetEntry {
  readonly source: string;
  readonly target: string;
  /**
   * When set, `source` is a UTF-8 template with `{{MODEL}}`; install/sync
   * substitutes the value from `workflow.models.<role>`.
   */
  readonly renderAgent?: WorkflowModelRole;
}

/** Maps each shipped file under `assets/` to its path under `<cwd>/.cursor/`. */
export const DEFAULT_MANIFEST = [
  {
    source: "assets/agents/architect.md",
    target: "agents/architect.md",
    renderAgent: "architect",
  },
  {
    source: "assets/agents/developer.md",
    target: "agents/developer.md",
    renderAgent: "developer",
  },
  {
    source: "assets/agents/planner.md",
    target: "agents/planner.md",
    renderAgent: "planner",
  },
  {
    source: "assets/agents/tester.md",
    target: "agents/tester.md",
    renderAgent: "tester",
  },
  { source: "assets/rules/global.mdc", target: "rules/global.mdc" },
  { source: "assets/rules/init.mdc", target: "rules/init.mdc" },
  { source: "assets/templates/backlog.md", target: "templates/backlog.md" },
  { source: "assets/templates/design.md", target: "templates/design.md" },
  { source: "assets/templates/overview.md", target: "templates/overview.md" },
  {
    source: "assets/templates/testability/README.md",
    target: "templates/testability/README.md",
  },
] as const satisfies readonly AssetEntry[];
