# One-time setup reconciliation session

You are the **post-`init` Cursor Agent session** for **reconciling this workspace** with the setup the user selected (including backlog mode—e.g. file-backed markdown ↔ GitHub Project v2—and workflow defaults baked into `.cursor/`). Workflow assets under `.cursor/` were just installed or updated with the **selected** configuration baked in. This file is a **one-time reconciliation prompt**—it is **not** an always-on rule; day-to-day orchestration follows `.cursor/rules/global.mdc`.

## Baked-in project configuration (target after transition)

{{BACKLOG_DETAILS_MARKDOWN}}

**Default workflow posture:** pre-development **`/architect-2`** **{{DEFAULT_PRE_DEVELOPMENT_REVIEW}}**; post-development **`/architect-2`** **{{DEFAULT_POST_DEVELOPMENT_REVIEW}}** (see `.cursor/rules/global.mdc`); adversarial testing **{{DEFAULT_TESTING}}**.

Summary: {{INSTALLED_WORKFLOW_CONTEXT_SUMMARY}}

## Reconciliation goals

1. **Align the repository** with the selected setup: backlog mode (local paths, GitHub MCP when applicable), workflow-owned references that still assume the old mode, and any other docs or tooling that should match the new configuration.
2. **Respect existing substance** — If `docs/overview.md` and `docs/design.md` are already substantive, do **not** rerun a full greenfield vision interview unless gaps block migration; if either doc is still in **template** mode, follow the vision gate in `global.mdc` before substantive edits.
3. **Remote backlog** — Follow **Safety and confirmation for remote changes** (below). Do **not** bulk-create, bulk-close, or mass-relabel GitHub issues without explicit user confirmation; prefer incremental, reviewable steps.
4. **Scope** — This is a **single reconciliation pass**. When the repo matches the selected setup, the user returns to normal workflow; they do not keep “living” in this prompt.

**Full backlog planning** (new epics, `/planner` roadmaps) is **out of scope** unless the user explicitly asks during this session.

---

## Backlog provider transition (file-backed ↔ GitHub Issues / Project v2)

When the **previous** backlog mode and the **baked-in target** above differ, treat backlog migration as a **data + naming migration**, not a vague “sync.” Work in **both directions** using the same building blocks: **field mapping**, **re-created work items in the destination**, **artifact renames**, and a durable **ID map**.

### 1) Establish source and destination

- **Source of truth during migration:** the system that still holds authoritative tasks **until** you have recreated them in the destination and renamed artifacts. Do not leave two competing “primary” backlogs without an explicit note (e.g. a short `docs/` migration note or a tracked mapping table).
- **Write down an ID map** before renaming files at scale: a small markdown table or list is enough:

  | Old id | New id | Notes |
  | :--- | :--- | :--- |
  | File `Entry` `007` | GitHub issue `#42` | … |
  | GitHub issue `#42` | File `Entry` `007` | … |

  **Old id** is either the file backlog **Entry** (zero-padded) or the **GitHub issue number**. **New id** is the identifier that will be canonical **after** migration in the target mode.

### 2) Field mapping (must be explicit)

Map columns/fields **before** copying rows or opening issues. Align semantics with the installed workflow: **Priority** orders work; **Status** follows `TODO` → `In Progress` → `Ready to Test` → `Complete`; **Size** uses **`S`**, **`M`**, **`L`**, **`XL`** to match file-backed conventions and the GitHub Project **Size** field.

| File-backed (`docs/backlog.md` table) | GitHub Issues + Project (v2) | Migration notes |
| :--- | :--- | :--- |
| **Entry** | **Issue number** (durable id) | File `Entry` is **not** the GitHub issue number until you assign issue numbers by creating issues. After migration **to** GitHub, the issue number replaces `Entry` as the user-facing task id. After migration **to** file, assign the next unused **Entry** per row; keep the former issue number in **Notes** or the ID map for traceability. |
| **Epic** | **Milestone** on the issue (or repo epic convention) | Preserve epic names; fixup if your org uses labels instead of milestones—record the convention in the ID map or a one-line note in `docs/`. |
| **Priority** | Project field **Priority** | Lower numbers sort earlier (`1` before `2`); `1000` = unprioritized default in file mode—mirror in Project when applicable. |
| **Size** | Project field **Size** | Same vocabulary **`S`/`M`/`L`/`XL`** across modes. |
| **Task Description** | Issue **title** | One task per issue when recreating from file rows. |
| **Acceptance Criteria** | Issue **body** (top section or dedicated heading) | Keep acceptance criteria readable; in GitHub mode, reserve space for workflow-owned **task lists** in the body per installed workflow (checkboxes the closing agent reconciles). |
| **Status** | Project field **Status** | Map each status string to the corresponding Project **Status** option; if an option is missing, **pause** and ask the user—do not silently drop status. |
| **Prototype** | Issue body section, comment, or linked path | Preserve `prototypes/[slug].[ext]` paths; update references after prototype renames (below). |
| **Notes** | Issue body (Notes) or a comment | Include verification handoffs; link `docs/testability/...` after renames. |

### 3) Re-create tasks in the destination system

**Principle:** Each logical task exists **once** in the canonical backlog after migration. “Re-create” means **new rows** or **new issues** that carry the mapped fields—not half-migrated stubs.

**File-backed → GitHub**

1. List tasks to migrate (typically all non-placeholder rows in `docs/backlog.md`; confirm with the user if the table is large or mixed with template rows).
2. **Batch create issues** in small, reviewable groups (e.g. 5–10) unless the user explicitly approves a larger batch. For each row: title = Task Description; body = Acceptance Criteria + Epic/Notes/Prototype as needed; attach to the configured **repository** and **Project (v2)**.
3. Set Project fields: **Priority**, **Status**, **Size** (and **Epic** via milestone/label per your mapping above).
4. Record **Entry → issue number** in the ID map as you go.
5. When GitHub is authoritative, **deprecate or archive** the old file backlog in a controlled way: either leave `docs/backlog.md` as a pointer/README to GitHub mode (if your workflow allows) or clearly mark it superseded—**do not delete** user backlog content without confirmation.

**GitHub → File-backed**

1. List issues to migrate (Project view / filters). Exclude items that are not real tasks (meta, duplicates) unless the user wants them.
2. For each issue, **append a new row** to `docs/backlog.md` using the table schema from the installed backlog template: assign the **next unused zero-padded Entry** (`001`, `002`, …); do **not** renumber existing entries.
3. Copy fields per the table above. Put the **former GitHub issue number** in **Notes** (or keep it only in the ID map—pick one approach and stay consistent).
4. When the file backlog is authoritative, issues on GitHub may remain open for traceability or be closed with a short comment pointing at the file row—**only** per user preference; do not mass-close without explicit **Safety and confirmation** approval.

### 4) Rename prototypes, ADRs, and testability files (identifier alignment)

Per-task files use the **canonical backlog id** as the filename prefix:

- **Testability:** `docs/testability/<backlog-id>-<brief-description>.md`
  - File-backed: `<backlog-id>` = **`Entry`** (e.g. `025`).
  - GitHub-backed: `<backlog-id>` = **issue number** (e.g. `42`).
- **ADRs:** `docs/adr/<backlog-id>-<brief-description>.md` (same id rule; only for tasks explicitly labeled research/spike/decision-record in the backlog).
- **Prototypes:** paths live in the **Prototype** column / issue field; if filenames embed the old id (e.g. `prototypes/007-auth-flow.md`), rename to match the **new** id and update the backlog cell/issue reference.

**Rename procedure (either direction):**

1. For every `docs/testability/` and `docs/adr/` file whose prefix is the **old** id, rename to the **new** id (keep the same `<brief-description>` slug).
2. Update **internal links** (README index, `docs/overview.md`, `docs/design.md`, planner Notes) that pointed at old filenames.
3. Update the **Prototype** column or issue body to reference renamed prototype paths.

### 5) Safety and confirmation for remote changes

These boundaries preserve trust while keeping the procedure **operational**:

- **Always confirm first** (single explicit user go-ahead) before: creating **more than a small batch** of issues, **mass-closing** issues, **bulk** label/milestone/Project field edits, or **deleting** `docs/backlog.md` / large table sections.
- **Prefer read-then-write:** summarize what you will create or change, then execute in batches.
- **Never** assume silent deletion of the old backlog medium is OK—offer to keep a read-only export or pointer.

### 6) Completion check (both directions)

- [ ] ID map exists for every migrated task that had per-task files or prototypes.
- [ ] Project fields **Priority**, **Status**, **Size** (and Epic handling) match the mapping above for GitHub-backed mode.
- [ ] `docs/testability/*` and `docs/adr/*` prefixes match the **canonical** id for the target mode.
- [ ] No broken links from README/index or docs to old filenames.
- [ ] If GitHub issues are used: workflow-owned **checkboxes** in issue bodies (if present) reflect reality before any “Complete” status—per `global.mdc` and developer guidance.

---

## Re-entry

Interrupted? Re-run `npx @byrde/cursor init` in this project; when a provider transition was confirmed in the CLI, the installer may relaunch this reconciliation session until the repo is aligned with the selected setup.

Assets are already installed—do not tell the user to run `init` **for installation** only. Re-run is OK to resume reconciliation or after manual edits.
