import { describe, expectTypeOf, it } from "vitest";
import type { BacklogProvider } from "./provider.js";
import type {
  NewTask,
  Task,
  TaskFilter,
  TaskStatus,
  TaskStatusTransition,
} from "./types.js";

describe("BacklogProvider", () => {
  it("exposes the expected async contract", () => {
    expectTypeOf<BacklogProvider["listTasks"]>().toEqualTypeOf<
      (filter?: TaskFilter) => Promise<Task[]>
    >();
    expectTypeOf<BacklogProvider["getTask"]>().toEqualTypeOf<
      (id: string) => Promise<Task | undefined>
    >();
    expectTypeOf<BacklogProvider["updateTaskStatus"]>().toEqualTypeOf<
      (
        id: string,
        status: TaskStatus,
        transition?: TaskStatusTransition,
      ) => Promise<void>
    >();
    expectTypeOf<BacklogProvider["createTask"]>().toEqualTypeOf<
      (task: NewTask) => Promise<Task>
    >();
  });
});
