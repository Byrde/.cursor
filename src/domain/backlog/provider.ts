import type {
  NewTask,
  Task,
  TaskFilter,
  TaskStatus,
  TaskStatusTransition,
} from "./types.js";

export interface BacklogProvider {
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  updateTaskStatus(
    id: string,
    status: TaskStatus,
    transition?: TaskStatusTransition,
  ): Promise<void>;
  createTask(task: NewTask): Promise<Task>;
}
