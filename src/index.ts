export const BYRDE_CURSOR_PACKAGE_NAME = "@byrde/cursor";

export type { AssetEntry, MarkdownRenderSpec } from "./domain/asset-manifest.js";
export { DEFAULT_MANIFEST } from "./domain/asset-manifest.js";
export type { BacklogProvider } from "./domain/backlog/provider.js";
export type {
  NewTask,
  StandardTaskSize,
  Task,
  TaskFilter,
  TaskPriority,
  TaskStatus,
  TaskStatusTransition,
} from "./domain/backlog/types.js";
export {
  DEFAULT_TASK_PRIORITY,
  isStandardTaskSize,
  STANDARD_TASK_SIZES,
  TASK_STATUS_VALUES,
} from "./domain/backlog/types.js";
export type {
  GitHubIssuesBacklogConfig,
  ProjectConfig,
  WorkflowModelRole,
  WorkflowModels,
} from "./domain/config.js";
export {
  createDefaultProjectConfig,
  createDefaultWorkflowModels,
  DEFAULT_PROJECT_CONFIG,
  normalizeProjectConfig,
} from "./domain/config.js";
export { FileBacklogProvider } from "./infrastructure/file-backlog-provider.js";
export { GitHubIssuesBacklogProvider } from "./infrastructure/github-issues-backlog-provider.js";
