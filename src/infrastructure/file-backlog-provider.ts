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
} from "../domain/backlog/types.js";

const LEGACY_COLUMN_ORDER = [
  "Epic",
  "Task Description",
  "Acceptance Criteria",
  "Status",
  "Prototype",
  "Notes",
] as const;

const COLUMN_ORDER = [
  "Epic",
  "Priority",
  "Task Description",
  "Acceptance Criteria",
  "Status",
  "Prototype",
  "Notes",
] as const;

type LegacyColumnName = (typeof LEGACY_COLUMN_ORDER)[number];
type ColumnName = (typeof COLUMN_ORDER)[number];

type TableVariant = "legacy" | "withPriority";

interface ParsedRow {
  readonly id: string;
  readonly cells: Record<ColumnName, string>;
}

interface ParsedBacklogDocument {
  readonly variant: TableVariant;
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

function parseBacklogDocument(content: string): ParsedBacklogDocument {
  const lines = content.split(/\r?\n/);
  const tableStart = lines.findIndex((line, index) => {
    return line.trim().startsWith("|") && lines[index + 1]?.trim().startsWith("|");
  });

  if (tableStart < 0) {
    throw new Error("Could not find backlog markdown table.");
  }

  let tableEnd = tableStart;
  while (tableEnd < lines.length && lines[tableEnd].trim().startsWith("|")) {
    tableEnd += 1;
  }

  const headerCells = splitMarkdownRow(lines[tableStart]);
  let variant: TableVariant;
  let columnNames: readonly string[];

  if (headerMatches(headerCells, COLUMN_ORDER)) {
    variant = "withPriority";
    columnNames = COLUMN_ORDER;
  } else if (headerMatches(headerCells, LEGACY_COLUMN_ORDER)) {
    variant = "legacy";
    columnNames = LEGACY_COLUMN_ORDER;
  } else {
    throw new Error(
      "Unexpected backlog table header (expected Epic + Priority + … or legacy Epic + Task Description + …).",
    );
  }

  const rowLines = lines.slice(tableStart + 2, tableEnd);
  const rows: ParsedRow[] = rowLines.map((line, rowIndex) => {
    const cells = splitMarkdownRow(line);
    if (cells.length !== columnNames.length) {
      throw new Error(`Unexpected backlog row width at row ${rowIndex + 1}.`);
    }

    if (variant === "legacy") {
      const legacyCells = Object.fromEntries(
        LEGACY_COLUMN_ORDER.map((column, columnIndex) => [
          column,
          cells[columnIndex],
        ]),
      ) as Record<LegacyColumnName, string>;

      const full: Record<ColumnName, string> = {
        Epic: legacyCells.Epic,
        Priority: formatPriority(DEFAULT_TASK_PRIORITY),
        "Task Description": legacyCells["Task Description"],
        "Acceptance Criteria": legacyCells["Acceptance Criteria"],
        Status: legacyCells.Status,
        Prototype: legacyCells.Prototype,
        Notes: legacyCells.Notes,
      };

      return {
        id: `backlog-${rowIndex + 1}`,
        cells: full,
      };
    }

    const withP = Object.fromEntries(
      COLUMN_ORDER.map((column, columnIndex) => [column, cells[columnIndex]]),
    ) as Record<ColumnName, string>;

    return {
      id: `backlog-${rowIndex + 1}`,
      cells: withP,
    };
  });

  return {
    variant,
    beforeTable: lines.slice(0, tableStart),
    rows,
    afterTable: lines.slice(tableEnd),
  };
}

function renderTable(
  rows: readonly ParsedRow[],
  variant: TableVariant,
): string[] {
  if (variant === "legacy") {
    const bodyRows = rows.map((row) =>
      LEGACY_COLUMN_ORDER.map((column) => {
        if (column === "Epic") {
          return row.cells.Epic;
        }
        if (column === "Task Description") {
          return row.cells["Task Description"];
        }
        if (column === "Acceptance Criteria") {
          return row.cells["Acceptance Criteria"];
        }
        if (column === "Status") {
          return row.cells.Status;
        }
        if (column === "Prototype") {
          return row.cells.Prototype;
        }
        return row.cells.Notes;
      }),
    );
    const widths = LEGACY_COLUMN_ORDER.map((column, index) =>
      Math.max(
        column.length,
        ...bodyRows.map((cells) => cells[index]?.length ?? 0),
      ),
    );
    const renderRow = (cells: readonly string[]): string =>
      `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;
    const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
    return [
      renderRow(LEGACY_COLUMN_ORDER),
      separator,
      ...bodyRows.map(renderRow),
    ];
  }

  const bodyRows = rows.map((row) => COLUMN_ORDER.map((column) => row.cells[column]));
  const widths = COLUMN_ORDER.map((column, index) =>
    Math.max(
      column.length,
      ...bodyRows.map((cells) => cells[index]?.length ?? 0),
    ),
  );

  const renderRow = (cells: readonly string[]): string =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;

  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;

  return [renderRow(COLUMN_ORDER), separator, ...bodyRows.map(renderRow)];
}

function toTask(row: ParsedRow): Task {
  return {
    id: row.id,
    epic: row.cells.Epic,
    priority: parsePriorityCell(row.cells.Priority),
    description: row.cells["Task Description"],
    acceptanceCriteria: row.cells["Acceptance Criteria"],
    status: normalizeStatus(row.cells.Status),
    prototype: row.cells.Prototype,
    notes: row.cells.Notes,
  };
}

function sortTasksForList(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    const ai = Number.parseInt(a.id.replace(/^backlog-/, ""), 10);
    const bi = Number.parseInt(b.id.replace(/^backlog-/, ""), 10);
    return ai - bi;
  });
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
    const tasks = doc.rows.map(toTask);
    return sortTasksForList(applyFilter(tasks, filter));
  }

  async getTask(id: string): Promise<Task | undefined> {
    const doc = await this.readDocument();
    const row = doc.rows.find((entry) => entry.id === id);
    return row ? toTask(row) : undefined;
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
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
    let variant = doc.variant;

    if (variant === "legacy") {
      for (const r of doc.rows) {
        r.cells.Priority = formatPriority(DEFAULT_TASK_PRIORITY);
      }
      variant = "withPriority";
    }

    const nextRow: ParsedRow = {
      id: `backlog-${doc.rows.length + 1}`,
      cells: {
        Epic: task.epic,
        Priority: formatPriority(task.priority),
        "Task Description": task.description,
        "Acceptance Criteria": task.acceptanceCriteria,
        Status: formatStatus(task.status),
        Prototype: task.prototype,
        Notes: task.notes,
      },
    };

    const nextDoc: ParsedBacklogDocument = {
      ...doc,
      variant,
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
      ...renderTable(doc.rows, doc.variant),
      ...doc.afterTable,
    ];
    await writeFile(this.backlogPath, nextLines.join("\n"), "utf8");
  }

  get path(): string {
    return path.resolve(this.backlogPath);
  }
}
