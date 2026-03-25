import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { ManagedState } from "../domain/managed-state.js";

export const MANAGED_STATE_FILENAME = ".managed.json";

function managedStatePath(cursorDir: string): string {
  return path.join(cursorDir, MANAGED_STATE_FILENAME);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseManagedState(raw: string): ManagedState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Invalid managed state JSON in ${MANAGED_STATE_FILENAME}: ${msg}`,
    );
  }

  if (!isPlainRecord(parsed)) {
    throw new Error(
      `Invalid managed state: root must be a JSON object (${MANAGED_STATE_FILENAME})`,
    );
  }

  const version = parsed.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(
      `Invalid managed state: missing or invalid "version" string (${MANAGED_STATE_FILENAME})`,
    );
  }

  const filesRaw = parsed.files;
  if (!isPlainRecord(filesRaw)) {
    throw new Error(
      `Invalid managed state: "files" must be an object (${MANAGED_STATE_FILENAME})`,
    );
  }

  const files: Record<string, ManagedState["files"][string]> = {};
  for (const [target, rec] of Object.entries(filesRaw)) {
    if (!isPlainRecord(rec)) {
      throw new Error(
        `Invalid managed state: files["${target}"] must be an object (${MANAGED_STATE_FILENAME})`,
      );
    }
    const hash = rec.hash;
    const ver = rec.version;
    if (typeof hash !== "string" || hash.length === 0) {
      throw new Error(
        `Invalid managed state: files["${target}"].hash must be a non-empty string (${MANAGED_STATE_FILENAME})`,
      );
    }
    if (typeof ver !== "string" || ver.length === 0) {
      throw new Error(
        `Invalid managed state: files["${target}"].version must be a non-empty string (${MANAGED_STATE_FILENAME})`,
      );
    }
    const installedAt = rec.installedAt;
    files[target] = {
      hash,
      version: ver,
      ...(typeof installedAt === "string" ? { installedAt } : {}),
    };
  }

  const installedAt = parsed.installedAt;
  return {
    version,
    ...(typeof installedAt === "string" ? { installedAt } : {}),
    files,
  };
}

/**
 * Loads `.cursor/.managed.json`. Returns `null` if the file is absent.
 * Invalid or corrupt JSON fails fast with a clear error; no writes are performed.
 */
export function loadManagedState(cursorDir: string): ManagedState | null {
  const p = managedStatePath(cursorDir);
  if (!existsSync(p)) {
    return null;
  }
  const raw = readFileSync(p, "utf8");
  return parseManagedState(raw);
}

/**
 * Writes managed state atomically (temp file + rename) under `cursorDir`.
 */
export function saveManagedStateAtomic(
  cursorDir: string,
  state: ManagedState,
): void {
  mkdirSync(cursorDir, { recursive: true });
  const finalPath = managedStatePath(cursorDir);
  const tmpPath = `${finalPath}.${process.pid}.tmp`;
  const payload = `${JSON.stringify(state, null, 2)}\n`;
  try {
    writeFileSync(tmpPath, payload, "utf8");
    renameSync(tmpPath, finalPath);
  } catch (e) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw e;
  }
}
