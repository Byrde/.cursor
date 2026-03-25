import type { NewTask, Task, TaskFilter, TaskStatus } from "./types.js";

export interface BacklogProvider {
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  updateTaskStatus(id: string, status: TaskStatus): Promise<void>;
  createTask(task: NewTask): Promise<Task>;
}
