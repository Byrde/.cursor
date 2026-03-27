import {
  createDefaultProjectConfig,
  type ProjectConfig,
  type WorkflowModelRole,
} from "../domain/config.js";
import { renderWorkflowMarkdownAsset } from "./workflow-asset-renderer.js";

/** Placeholder in shipped agent templates; replaced at init/sync time. */
export const AGENT_MODEL_PLACEHOLDER = "{{MODEL}}";

/**
 * Substitutes `{{MODEL}}` using a synthetic config (for tests and narrow call sites).
 * Prefer `renderWorkflowMarkdownAsset` with a full normalized `ProjectConfig` in installers.
 */
export function renderAgentTemplate(
  templateUtf8: string,
  model: string,
  role: WorkflowModelRole = "planner",
): string {
  const base = createDefaultProjectConfig();
  const merged: ProjectConfig = {
    ...base,
    workflow: {
      ...base.workflow,
      models: {
        ...base.workflow.models,
        [role]: model,
      },
    },
  };
  return renderWorkflowMarkdownAsset(templateUtf8, merged, {
    kind: "markdown",
    agentRole: role,
  });
}
