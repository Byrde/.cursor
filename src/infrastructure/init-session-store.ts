import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const INIT_SESSION_FILENAME = "byrde-init-session.json";

export interface InitSessionRecord {
  readonly version: 1;
  /** ISO 8601 timestamp when the Cursor `agent` CLI was successfully spawned for init. */
  readonly agentLaunchedAt: string;
  readonly packageVersion: string;
}

function sessionPath(cwd: string): string {
  return path.join(cwd, ".cursor", INIT_SESSION_FILENAME);
}

export function readInitSession(cwd: string): InitSessionRecord | undefined {
  const p = sessionPath(cwd);
  if (!existsSync(p)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as InitSessionRecord;
    if (raw?.version !== 1 || typeof raw.agentLaunchedAt !== "string") {
      return undefined;
    }
    return raw;
  } catch {
    return undefined;
  }
}

export function writeInitSession(
  cwd: string,
  record: Omit<InitSessionRecord, "version"> & { version?: 1 },
): void {
  const full: InitSessionRecord = {
    version: 1,
    agentLaunchedAt: record.agentLaunchedAt,
    packageVersion: record.packageVersion,
  };
  mkdirSync(path.dirname(sessionPath(cwd)), { recursive: true });
  writeFileSync(sessionPath(cwd), `${JSON.stringify(full, null, 2)}\n`, "utf8");
}

export function clearInitSession(cwd: string): void {
  const p = sessionPath(cwd);
  if (existsSync(p)) {
    unlinkSync(p);
  }
}
