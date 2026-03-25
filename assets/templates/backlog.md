# Project Backlog

| Epic | Priority | Task Description | Acceptance Criteria | Status | Prototype | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **[Epic from Key Features]** | 1000 | [Task Title or User Story] | [Verifiable criteria for completion] | `TODO` |  | [Dependencies, context, testability considerations] |
| **[Epic from Key Features]** | 1000 | [Task Title or User Story] | [Verifiable criteria for completion] | `TODO` |  | [Dependencies, context, testability considerations] |

## Column Guide

- **Priority**: Lower numbers sort earlier in the backlog (`1` before `2`). Use `1000` as an unprioritized default. In GitHub Project (v2) mode, this mirrors the Project **Priority** field.
- **Status**: Must follow `TODO` → `In Progress` → `Ready to Test` → `Complete`. In GitHub Project (v2) mode, this mirrors the Project **Status** field.
- **Epic**: In GitHub mode, epics are represented by **milestones** on issues.
- **Prototype**: Maintained by prototyping workflow. Leave empty for new tasks. When prototype exists: `prototypes/[slug].[ext]` + brief findings.
- **Notes**: Include testability considerations for non-trivial verification:
  - If feature involves long-running processes, note start/verify/stop pattern needed
  - If feature requires user interaction for testing, note the handoff scenario
  - If verification is straightforward, no note needed
  - Prefer pointing at the per-feature file under `docs/testability/` (e.g. `010-feature-slug.md`) when verification is non-trivial
