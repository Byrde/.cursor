/** Canonical status values for markdown and GitHub-backed tasks. */
export const TASK_STATUS_VALUES = [
  "TODO",
  "In Progress",
  "Ready to Test",
  "Complete",
] as const;

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

/**
 * Lower numbers sort first (1 = highest priority). Empty or non-numeric Priority
 * cells fall back to {@link DEFAULT_TASK_PRIORITY}.
 */
export type TaskPriority = number;

/** Default for rows missing a Priority cell (unprioritized / lowest). */
export const DEFAULT_TASK_PRIORITY = 1000;

/**
 * Shared relative-estimate vocabulary for file-backed `Size` column and GitHub
 * Project single-select **Size** fields. Older file-backed rows may leave Size
 * blank; treat empty strings as “unset” for display and mapping.
 */
export const STANDARD_TASK_SIZES = ["S", "M", "L", "XL"] as const;

export type StandardTaskSize = (typeof STANDARD_TASK_SIZES)[number];

export function isStandardTaskSize(value: string): value is StandardTaskSize {
  return (STANDARD_TASK_SIZES as readonly string[]).includes(value.trim());
}

export interface Task {
  readonly id: string;
  readonly epic: string;
  readonly priority: TaskPriority;
  /** Relative estimate for file-backed rows (`Size` column); GitHub-backed may map a Project field. */
  readonly size: string;
  readonly description: string;
  readonly acceptanceCriteria: string;
  readonly status: TaskStatus;
  readonly prototype: string;
  readonly notes: string;
}

export interface TaskFilter {
  readonly status?: TaskStatus;
  readonly epic?: string;
}

/**
 * Optional metadata when moving a task between statuses (e.g. completion notes,
 * workflow-owned checklist reconciliation for GitHub-backed issues).
 */
export interface TaskStatusTransition {
  readonly comment?: string;
  readonly workflowChecklist?: ReadonlyArray<{
    readonly text: string;
    readonly checked: boolean;
  }>;
}

export type NewTask = Omit<Task, "id">;
