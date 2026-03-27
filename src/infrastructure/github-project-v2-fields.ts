/**
 * Helpers for GitHub Project (v2) field definitions returned from GraphQL
 * (`fields` on `ProjectV2`). Used by `GitHubIssuesBacklogProvider`.
 */

export type ProjectFieldKind = "number" | "singleSelect";

export interface ResolvedProjectField {
  readonly id: string;
  readonly name: string;
  readonly kind: ProjectFieldKind;
  /** Populated when `kind` is `singleSelect`. */
  readonly options: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}

export class GitHubProjectFieldError extends Error {
  override readonly name = "GitHubProjectFieldError";
  constructor(message: string) {
    super(message);
  }
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

/**
 * Resolves a Project v2 field node by human-readable name and validates
 * GraphQL typename (`ProjectV2NumberField` vs `ProjectV2SingleSelectField`).
 */
export function resolveNamedProjectField(
  nodes: readonly unknown[],
  fieldName: string,
  expectedKind: ProjectFieldKind,
): ResolvedProjectField {
  const needle = fieldName.trim();
  if (!needle.length) {
    throw new GitHubProjectFieldError("Project field name is empty.");
  }

  for (const raw of nodes) {
    const n = asRecord(raw);
    if (!n) {
      continue;
    }
    const name = typeof n.name === "string" ? n.name.trim() : "";
    if (name !== needle) {
      continue;
    }

    const typename = typeof n.__typename === "string" ? n.__typename : "";
    if (expectedKind === "number") {
      if (typename !== "ProjectV2NumberField") {
        throw new GitHubProjectFieldError(
          `Project field "${needle}" must be a Number field for this mapping (found ${typename || "unknown"}).`,
        );
      }
      const id = typeof n.id === "string" ? n.id : "";
      if (!id) {
        throw new GitHubProjectFieldError(`Project field "${needle}" is missing an id.`);
      }
      return { id, name: needle, kind: "number", options: [] };
    }

    if (typename !== "ProjectV2SingleSelectField") {
      throw new GitHubProjectFieldError(
        `Project field "${needle}" must be a Single select field for this mapping (found ${typename || "unknown"}).`,
      );
    }
    const id = typeof n.id === "string" ? n.id : "";
    if (!id) {
      throw new GitHubProjectFieldError(`Project field "${needle}" is missing an id.`);
    }
    const optionsRaw = n.options;
    const options: Array<{ id: string; name: string }> = [];
    if (Array.isArray(optionsRaw)) {
      for (const o of optionsRaw) {
        const or = asRecord(o);
        if (
          or && typeof or.id === "string" && typeof or.name === "string"
        ) {
          options.push({ id: or.id, name: or.name });
        }
      }
    }
    return { id, name: needle, kind: "singleSelect", options };
  }

  throw new GitHubProjectFieldError(
    `Project field "${needle}" was not found on this GitHub Project.`,
  );
}

/**
 * Returns the single-select option id for an option name, or throws with the
 * allowed option names (for Size / Status writes).
 */
export function requireSingleSelectOptionId(
  field: ResolvedProjectField,
  value: string,
): string {
  if (field.kind !== "singleSelect") {
    throw new GitHubProjectFieldError(
      `Internal error: field "${field.name}" is not single-select.`,
    );
  }
  const v = value.trim();
  const hit = field.options.find((o) => o.name === v);
  if (!hit) {
    const labels = field.options.map((o) => o.name).join(", ") || "(none)";
    throw new GitHubProjectFieldError(
      `No "${field.name}" option "${v}". Configure the Project field options in GitHub or use one of: ${labels}.`,
    );
  }
  return hit.id;
}
