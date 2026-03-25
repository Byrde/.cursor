import { createHash } from "node:crypto";

/** One tracked file under `.cursor/` as persisted in `.managed.json`. */
export interface ManagedFileRecord {
  /** Content hash, e.g. `sha256:hex…`. */
  readonly hash: string;
  /** Package version that last wrote this record. */
  readonly version: string;
  /** When this record was last written (ISO 8601). */
  readonly installedAt?: string;
}

/** Top-level managed state persisted at `.cursor/.managed.json`. */
export interface ManagedState {
  /** Package version from the last successful install run. */
  readonly version: string;
  readonly installedAt?: string;
  readonly files: Record<string, ManagedFileRecord>;
}

export function hashFileContents(data: Buffer): string {
  const hex = createHash("sha256").update(data).digest("hex");
  return `sha256:${hex}`;
}
