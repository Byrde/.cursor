# Project Backlog

This file is a **lightweight scaffold**: add tasks when you plan work. Backlog population is **not** required to finish project initialization — defer detailed planning until you explicitly ask for planning or feature work (see `.cursor/rules/global.mdc`).

| Entry | Epic | Priority | Size | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

## Column Guide

- **Entry**: Explicit user-facing backlog item number for file-backed mode. Assign the next unused zero-padded number (`001`, `002`, ...) when creating a task and keep it stable even if rows move. In GitHub-backed mode, the GitHub issue number is the durable user-facing identifier.
- **Priority**: Lower numbers sort earlier in the backlog (`1` before `2`). Use `1000` as an unprioritized default. In GitHub Project (v2) mode, this mirrors the Project **Priority** field.
- **Size**: Relative estimate for the task (`S`, `M`, `L`, `XL` by default). In GitHub Project (v2) mode, this should mirror the Project **Size** field or equivalent estimate field.
- **Status**: Must follow `TODO` → `In Progress` → `Ready to Test` → `Complete`.
- **Prototype**: Maintained by prototyping workflow. Leave empty for new tasks. When prototype exists: `prototypes/[slug].[ext]` + brief findings.
- **Notes**: For non-trivial verification, note long-running (start/verify/stop) or user handoff needs; skip if straightforward. Prefer per-task files: `docs/testability/<Entry>-<brief-description>.md` (file-backed) or `docs/testability/<issue-number>-<brief-description>.md` (GitHub). **ADRs:** only for explicit research/spike/decision-record tasks; paths `docs/adr/<Entry>-<brief-description>.md` or `docs/adr/<issue-number>-<brief-description>.md`. `init` ships `docs/adr/README.md` only—no ADR files until a task requires them.
