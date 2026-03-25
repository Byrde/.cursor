import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TASK_PRIORITY } from "../domain/backlog/types.js";
import { FileBacklogProvider } from "./file-backlog-provider.js";

const backlogFixture = `# Project Backlog

| Epic      | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| --------- | ---------------- | ------------------- | ------ | --------- | ----- |
| **Epic A** | Task one         | Does one thing      | \`TODO\` |           | note 1 |
| **Epic B** | Task two         | Does two things     | \`Complete\` | demo.md   | note 2 |

## Column Guide

- **Status**: Must follow \`TODO\` -> \`In Progress\` -> \`Ready to Test\` -> \`Complete\`
`;

function writeFixture(): { dir: string; file: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "byrde-backlog-"));
  const file = path.join(dir, "backlog.md");
  writeFileSync(file, backlogFixture, "utf8");
  return { dir, file };
}

describe("FileBacklogProvider", () => {
  it("lists tasks and supports filtering", async () => {
    const { dir, file } = writeFixture();
    try {
      const provider = new FileBacklogProvider(file);
      const all = await provider.listTasks();
      const filtered = await provider.listTasks({ status: "TODO" });

      expect(all).toHaveLength(2);
      expect(all[0]?.id).toBe("backlog-1");
      expect(all[0]?.priority).toBe(DEFAULT_TASK_PRIORITY);
      expect(all[1]?.description).toBe("Task two");
      expect(all[1]?.priority).toBe(DEFAULT_TASK_PRIORITY);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.epic).toBe("**Epic A**");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("gets a task by stable row-position id", async () => {
    const { dir, file } = writeFixture();
    try {
      const provider = new FileBacklogProvider(file);
      await expect(provider.getTask("backlog-2")).resolves.toMatchObject({
        id: "backlog-2",
        epic: "**Epic B**",
        status: "Complete",
      });
      await expect(provider.getTask("backlog-9")).resolves.toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("updates task status and preserves content outside the table", async () => {
    const { dir, file } = writeFixture();
    try {
      const provider = new FileBacklogProvider(file);
      await provider.updateTaskStatus("backlog-1", "In Progress");

      const updated = readFileSync(file, "utf8");
      expect(updated).toContain("| **Epic A** | Task one");
      expect(updated).toContain("In Progress");
      expect(updated).toContain("## Column Guide");

      const task = await provider.getTask("backlog-1");
      expect(task?.status).toBe("In Progress");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a new task at the end of the table and returns it", async () => {
    const { dir, file } = writeFixture();
    try {
      const provider = new FileBacklogProvider(file);
      const created = await provider.createTask({
        epic: "**Epic C**",
        priority: 1001,
        description: "Task three",
        acceptanceCriteria: "Does three things",
        status: "TODO",
        prototype: "",
        notes: "note 3",
      });

      expect(created.id).toBe("backlog-3");
      expect(created.description).toBe("Task three");

      const tasks = await provider.listTasks();
      expect(tasks).toHaveLength(3);
      expect(tasks[2]?.id).toBe("backlog-3");

      const updated = readFileSync(file, "utf8");
      expect(updated).toContain("| **Epic C**");
      expect(updated).toContain("## Column Guide");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("orders tasks by Priority when the table includes a Priority column", async () => {
    const content = `# Backlog

| Epic | Priority | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| ---- | -------- | ---------------- | ------------------- | ------ | --------- | ----- |
| A | 2 | Second | c | \`TODO\` | | |
| A | 1 | First | c | \`TODO\` | | |
`;
    const dir = mkdtempSync(path.join(tmpdir(), "byrde-backlog-prio-"));
    const file = path.join(dir, "backlog.md");
    writeFileSync(file, content, "utf8");
    try {
      const provider = new FileBacklogProvider(file);
      const tasks = await provider.listTasks();
      expect(tasks.map((t) => t.description)).toEqual(["First", "Second"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid Status cell values", async () => {
    const content = `# Backlog

| Epic | Priority | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| ---- | -------- | ---------------- | ------------------- | ------ | --------- | ----- |
| A | 1 | Bad | c | \`Not A Status\` | | |
`;
    const dir = mkdtempSync(path.join(tmpdir(), "byrde-backlog-bad-status-"));
    const file = path.join(dir, "backlog.md");
    writeFileSync(file, content, "utf8");
    try {
      const provider = new FileBacklogProvider(file);
      await expect(provider.listTasks()).rejects.toThrow(/Invalid task status/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("migrates a legacy table to include Priority when creating a task", async () => {
    const { dir, file } = writeFixture();
    try {
      const provider = new FileBacklogProvider(file);
      await provider.createTask({
        epic: "**Epic C**",
        priority: 5,
        description: "Task three",
        acceptanceCriteria: "Does three things",
        status: "TODO",
        prototype: "",
        notes: "note 3",
      });

      const updated = readFileSync(file, "utf8");
      expect(updated).toContain("Priority");
      expect(updated).toContain("| **Epic C** | 5");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
