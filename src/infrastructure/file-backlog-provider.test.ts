import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TASK_PRIORITY } from "../domain/backlog/types.js";
import { FileBacklogProvider } from "./file-backlog-provider.js";

const backlogFixture = `# Project Backlog

| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| ----- | ---- | -------- | ---- | ------------------ | ------------------- | ------ | --------- | ----- |
| 001 | **Epic A** | 1000 |  | Task one | Does one thing | \`TODO\` |  | note 1 |
| 002 | **Epic B** | 1000 |  | Task two | Does two things | \`Complete\` | demo.md | note 2 |

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
      expect(all[0]?.id).toBe("001");
      expect(all[0]?.priority).toBe(DEFAULT_TASK_PRIORITY);
      expect(all[0]?.size).toBe("");
      expect(all[1]?.description).toBe("Task two");
      expect(all[1]?.priority).toBe(DEFAULT_TASK_PRIORITY);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.epic).toBe("**Epic A**");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("gets a task by Entry id", async () => {
    const { dir, file } = writeFixture();
    try {
      const provider = new FileBacklogProvider(file);
      await expect(provider.getTask("002")).resolves.toMatchObject({
        id: "002",
        epic: "**Epic B**",
        status: "Complete",
      });
      await expect(provider.getTask("backlog-2")).resolves.toBeUndefined();
      await expect(provider.getTask("999")).resolves.toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("updates task status and preserves content outside the table", async () => {
    const { dir, file } = writeFixture();
    try {
      const provider = new FileBacklogProvider(file);
      await provider.updateTaskStatus("001", "In Progress");

      const updated = readFileSync(file, "utf8");
      expect(updated).toContain("| **Epic A**");
      expect(updated).toContain("Task one");
      expect(updated).toContain("In Progress");
      expect(updated).toContain("## Column Guide");

      const task = await provider.getTask("001");
      expect(task?.status).toBe("In Progress");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores optional status transition payload", async () => {
    const { dir, file } = writeFixture();
    try {
      const provider = new FileBacklogProvider(file);
      await provider.updateTaskStatus("001", "In Progress", {
        comment: "not written to file",
        workflowChecklist: [{ text: "x", checked: true }],
      });
      const updated = readFileSync(file, "utf8");
      expect(updated).not.toContain("not written to file");
      const task = await provider.getTask("001");
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
        size: "",
        description: "Task three",
        acceptanceCriteria: "Does three things",
        status: "TODO",
        prototype: "",
        notes: "note 3",
      });

      expect(created.id).toBe("003");
      expect(created.description).toBe("Task three");

      const tasks = await provider.listTasks();
      expect(tasks).toHaveLength(3);
      expect(tasks[2]?.id).toBe("003");

      const updated = readFileSync(file, "utf8");
      expect(updated).toMatch(/\|\s*Entry\s*\|\s*Epic\s*\|\s*Priority\s*\|\s*Size\s*\|/);
      expect(updated).toContain("**Epic C**");
      expect(updated).toContain("## Column Guide");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("orders tasks by Priority then original document row order", async () => {
    const content = `# Backlog

| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| ----- | ---- | -------- | ---- | ------------------ | ------------------- | ------ | --------- | ----- |
| 002 | A | 2 |  | Second | c | \`TODO\` | | |
| 001 | A | 1 |  | First | c | \`TODO\` | | |
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

  it("uses document order when Priority ties", async () => {
    const content = `# Backlog

| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| ----- | ---- | -------- | ---- | ------------------ | ------------------- | ------ | --------- | ----- |
| 001 | A | 1 |  | Earlier | c | \`TODO\` | | |
| 002 | A | 1 |  | Later | c | \`TODO\` | | |
`;
    const dir = mkdtempSync(path.join(tmpdir(), "byrde-backlog-tie-"));
    const file = path.join(dir, "backlog.md");
    writeFileSync(file, content, "utf8");
    try {
      const provider = new FileBacklogProvider(file);
      const tasks = await provider.listTasks();
      expect(tasks.map((t) => t.description)).toEqual(["Earlier", "Later"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid Status cell values", async () => {
    const content = `# Backlog

| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| ----- | ---- | -------- | ---- | ------------------ | ------------------- | ------ | --------- | ----- |
| 001 | A | 1 |  | Bad | c | \`Not A Status\` | | |
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

  it("round-trips through createTask with canonical nine columns", async () => {
    const { dir, file } = writeFixture();
    try {
      const provider = new FileBacklogProvider(file);
      await provider.createTask({
        epic: "**Epic C**",
        priority: 5,
        size: "M",
        description: "Task three",
        acceptanceCriteria: "Does three things",
        status: "TODO",
        prototype: "",
        notes: "note 3",
      });

      const updated = readFileSync(file, "utf8");
      expect(updated).toMatch(/\|\s*Entry\s*\|\s*Epic\s*\|\s*Priority\s*\|\s*Size\s*\|/);
      expect(updated).toMatch(/\|\s*003\s*\|.*\*\*Epic C\*\*.*\|\s*5\s*\|\s*M\s*\|/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads canonical Entry and Size and round-trips", async () => {
    const content = `# Backlog

| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 029 | **Area** | 10 | L | Do X | Criteria | \`TODO\` |  |  |
`;
    const dir = mkdtempSync(path.join(tmpdir(), "byrde-backlog-canonical-"));
    const file = path.join(dir, "backlog.md");
    writeFileSync(file, content, "utf8");
    try {
      const provider = new FileBacklogProvider(file);
      const tasks = await provider.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        id: "029",
        priority: 10,
        size: "L",
        description: "Do X",
      });

      await provider.updateTaskStatus("029", "In Progress");
      const out = readFileSync(file, "utf8");
      expect(out).toMatch(/\|\s*029\s*\|.*\*\*Area\*\*.*\|\s*10\s*\|\s*L\s*\|/);
      expect(out).toContain("In Progress");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allocates the next monotonic Entry after the highest numeric", async () => {
    const content = `# Backlog

| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 028 | A | 1 |  | Old | c | \`TODO\` | | |
| 029 | A | 1 |  | Last | c | \`TODO\` | | |
`;
    const dir = mkdtempSync(path.join(tmpdir(), "byrde-backlog-mono-"));
    const file = path.join(dir, "backlog.md");
    writeFileSync(file, content, "utf8");
    try {
      const provider = new FileBacklogProvider(file);
      const created = await provider.createTask({
        epic: "B",
        priority: 2,
        size: "",
        description: "Next",
        acceptanceCriteria: "c",
        status: "TODO",
        prototype: "",
        notes: "",
      });
      expect(created.id).toBe("030");
      const out = readFileSync(file, "utf8");
      expect(out).toMatch(/\|\s*030\s*\|/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-canonical backlog headers", async () => {
    const content = `# Backlog

| Epic | Priority | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| ---- | -------- | ---------------- | ------------------- | ------ | --------- | ----- |
| A | 1 | B | C | \`TODO\` |  |  |
`;
    const dir = mkdtempSync(path.join(tmpdir(), "byrde-backlog-bad-hdr-"));
    const file = path.join(dir, "backlog.md");
    writeFileSync(file, content, "utf8");
    try {
      const provider = new FileBacklogProvider(file);
      await expect(provider.listTasks()).rejects.toThrow(/Unexpected backlog table header/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
