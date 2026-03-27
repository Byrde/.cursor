import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BacklogProvider } from "../domain/backlog/provider.js";
import {
  DEFAULT_TASK_PRIORITY,
  TASK_STATUS_VALUES,
  type NewTask,
  type Task,
  type TaskFilter,
  type TaskStatus,
  type TaskStatusTransition,
} from "../domain/backlog/types.js";

const CANONICAL_COLUMN_ORDER = [
  "Entry",
  "Epic",
  "Priority",
  "Size",
  "Task Description",
  "Acceptance Criteria",
  "Status",
  "Prototype",
  "Notes",
] as const;

type CanonicalColumnName = (typeof CANONICAL_COLUMN_ORDER)[number];

interface ParsedRow {
  /** Durable provider id; equals the `Entry` cell. */
  readonly id: string;
  /** 0-based index of this row in the table body (document order). */
  readonly documentRowIndex: number;
  readonly cells: Record<CanonicalColumnName, string>;
}

interface ParsedBacklogDocument {
  readonly beforeTable: string[];
  readonly rows: ParsedRow[];
  readonly afterTable: string[];
}

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUS_VALUES as readonly string[]).includes(value);
}

function normalizeStatus(raw: string): TaskStatus {
  const stripped = raw.replace(/^`|`$/g, "").trim();
  if (!isTaskStatus(stripped)) {
    throw new Error(
      `Invalid task status "${stripped}" (expected one of: ${TASK_STATUS_VALUES.join(", ")})`,
    );
  }
  return stripped;
}

function formatStatus(status: TaskStatus): string {
  return `\`${status}\``;
}

function parsePriorityCell(raw: string): number {
  const t = raw.replace(/^`|`$/g, "").trim();
  if (!t.length) {
    return DEFAULT_TASK_PRIORITY;
  }
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : DEFAULT_TASK_PRIORITY;
}

function formatPriority(priority: number): string {
  return String(priority);
}

function splitMarkdownRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    throw new Error(`Invalid backlog table row: ${line}`);
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function headerMatches(
  cells: readonly string[],
  expected: readonly string[],
): boolean {
  if (cells.length !== expected.length) {
    return false;
  }
  return expected.every((name, i) => cells[i] === name);
}

function parseEntryNumeric(id: string): number | undefined {
  const t = id.trim();
  if (!/^\d+$/.test(t)) {
    return undefined;
  }
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : undefined;
}

function maxNumericEntry(rows: readonly ParsedRow[]): number {
  let max = 0;
  for (const row of rows) {
    const n = parseEntryNumeric(row.id);
    if (n !== undefined) {
      max = Math.max(max, n);
    }
  }
  return max;
}

function entryDisplayWidth(rows: readonly ParsedRow[]): number {
  let w = 3;
  for (const row of rows) {
    const id = row.id.trim();
    if (/^\d+$/.test(id)) {
      w = Math.max(w, id.length);
    }
  }
  return w;
}

function formatNextEntryId(n: number, minWidth: number): string {
  const s = String(n);
  const width = Math.max(minWidth, s.length, 3);
  return s.length >= width ? s : s.padStart(width, "0");
}

function parseBacklogDocument(content: string): ParsedBacklogDocument {
  const lines = content.split(/\r?\n/);
  const tableStart = lines.findIndex((line, index) => {
    return (
      line.trim().startsWith("|") && lines[index + 1]?.trim().startsWith("|")
    );
  });

  if (tableStart < 0) {
    throw new Error("Could not find backlog markdown table.");
  }

  let tableEnd = tableStart;
  while (tableEnd < lines.length && lines[tableEnd].trim().startsWith("|")) {
    tableEnd += 1;
  }

  const headerCells = splitMarkdownRow(lines[tableStart]);
  if (!headerMatches(headerCells, CANONICAL_COLUMN_ORDER)) {
    throw new Error(
      "Unexpected backlog table header (expected Entry, Epic, Priority, Size, Task Description, Acceptance Criteria, Status, Prototype, Notes).",
    );
  }

  const rowLines = lines.slice(tableStart + 2, tableEnd);
  const rows: ParsedRow[] = rowLines.map((line, rowIndex) => {
    const cells = splitMarkdownRow(line);
    if (cells.length !== CANONICAL_COLUMN_ORDER.length) {
      throw new Error(`Unexpected backlog row width at row ${rowIndex + 1}.`);
    }
    const map = Object.fromEntries(
      CANONICAL_COLUMN_ORDER.map((column, i) => [column, cells[i] ?? ""]),
    ) as Record<CanonicalColumnName, string>;
    const id = map.Entry.trim();
    return {
      id,
      documentRowIndex: rowIndex,
      cells: map,
    };
  });

  return {
    beforeTable: lines.slice(0, tableStart),
    rows,
    afterTable: lines.slice(tableEnd),
  };
}

function renderCanonicalTable(rows: readonly ParsedRow[]): string[] {
  const bodyRows = rows.map((row) =>
    CANONICAL_COLUMN_ORDER.map((column) => row.cells[column]),
  );
  const widths = CANONICAL_COLUMN_ORDER.map((column, index) =>
    Math.max(
      column.length,
      ...bodyRows.map((cells) => cells[index]?.length ?? 0),
    ),
  );

  const renderRow = (cells: readonly string[]): string =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;

  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;

  return [
    renderRow(CANONICAL_COLUMN_ORDER),
    separator,
    ...bodyRows.map(renderRow),
  ];
}

function toTask(row: ParsedRow): Task {
  return {
    id: row.id,
    epic: row.cells.Epic,
    priority: parsePriorityCell(row.cells.Priority),
    size: row.cells.Size,
    description: row.cells["Task Description"],
    acceptanceCriteria: row.cells["Acceptance Criteria"],
    status: normalizeStatus(row.cells.Status),
    prototype: row.cells.Prototype,
    notes: row.cells.Notes,
  };
}

function sortTasksForList(tasks: Task[], rowOrder: Map<string, number>): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    const ai = rowOrder.get(a.id) ?? 0;
    const bi = rowOrder.get(b.id) ?? 0;
    return ai - bi;
  });
}

function buildRowOrderMap(rows: readonly ParsedRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.id, row.documentRowIndex);
  }
  return map;
}

function applyFilter(tasks: readonly Task[], filter?: TaskFilter): Task[] {
  if (!filter) {
    return [...tasks];
  }

  return tasks.filter((task) => {
    if (filter.status && task.status !== filter.status) {
      return false;
    }
    if (filter.epic && task.epic !== filter.epic) {
      return false;
    }
    return true;
  });
}

export class FileBacklogProvider implements BacklogProvider {
  constructor(private readonly backlogPath: string) {}

  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    const doc = await this.readDocument();
    const rowOrder = buildRowOrderMap(doc.rows);
    const tasks = doc.rows.map(toTask);
    return sortTasksForList(applyFilter(tasks, filter), rowOrder);
  }

  async getTask(id: string): Promise<Task | undefined> {
    const doc = await this.readDocument();
    const row = doc.rows.find((entry) => entry.id === id);
    return row ? toTask(row) : undefined;
  }

  async updateTaskStatus(
    id: string,
    status: TaskStatus,
    _transition?: TaskStatusTransition,
  ): Promise<void> {
    const doc = await this.readDocument();
    const row = doc.rows.find((entry) => entry.id === id);
    if (!row) {
      throw new Error(`Backlog task not found: ${id}`);
    }

    row.cells.Status = formatStatus(status);
    await this.writeDocument(doc);
  }

  async createTask(task: NewTask): Promise<Task> {
    const doc = await this.readDocument();
    const nextNum = maxNumericEntry(doc.rows) + 1;
    const width = entryDisplayWidth(doc.rows);
    const nextId = formatNextEntryId(nextNum, width);

    const nextRow: ParsedRow = {
      id: nextId,
      documentRowIndex: doc.rows.length,
      cells: {
        Entry: nextId,
        Epic: task.epic,
        Priority: formatPriority(task.priority),
        Size: task.size,
        "Task Description": task.description,
        "Acceptance Criteria": task.acceptanceCriteria,
        Status: formatStatus(task.status),
        Prototype: task.prototype,
        Notes: task.notes,
      },
    };

    const nextDoc: ParsedBacklogDocument = {
      ...doc,
      rows: [...doc.rows, nextRow],
    };

    await this.writeDocument(nextDoc);
    return toTask(nextRow);
  }

  private async readDocument(): Promise<ParsedBacklogDocument> {
    const raw = await readFile(this.backlogPath, "utf8");
    return parseBacklogDocument(raw);
  }

  private async writeDocument(doc: ParsedBacklogDocument): Promise<void> {
    const nextLines = [
      ...doc.beforeTable,
      ...renderCanonicalTable(doc.rows),
      ...doc.afterTable,
    ];
    await writeFile(this.backlogPath, nextLines.join("\n"), "utf8");
  }

  get path(): string {
    return path.resolve(this.backlogPath);
  }
}
