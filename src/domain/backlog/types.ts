/** Canonical status values for markdown and GitHub-backed tasks. */
export const TASK_STATUS_VALUES = [
  "TODO",
  "In Progress",
  "Ready to Test",
  "Complete",
] as const;

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

/**
 * Lower numbers sort first (1 = highest priority). File-backed backlogs without
 * a Priority column assign {@link DEFAULT_TASK_PRIORITY} when reading.
 */
export type TaskPriority = number;

/** Default for rows missing a Priority cell (unprioritized / lowest). */
export const DEFAULT_TASK_PRIORITY = 1000;

export interface Task {
  readonly id: string;
  readonly epic: string;
  readonly priority: TaskPriority;
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

export type NewTask = Omit<Task, "id">;
