# Architecture Decision Records (ADR)

This folder holds **accepted** architecture and product decisions that are tied to explicit backlog work.

## When to write an ADR

Create or update an ADR only when the **backlog task** is explicitly framed as **research**, a **spike**, or a **decision-record** (or clearly equivalent wording). Routine feature delivery does **not** require an ADR unless a dedicated task calls for one.

`init` installs this README so the convention is visible. **No starter decision files** are created here until a task actually needs a record—add a new file only when you are executing that backlog item.

## Naming (backlog-linked)

Use the same durable identifier as testability docs so the authorizing task stays discoverable:

| Backlog mode | ADR filename pattern |
|--------------|----------------------|
| **File-backed** (`docs/backlog.md` with `Entry` column) | `docs/adr/<Entry>-<brief-description>.md` |
| **GitHub-backed** (issue number as id) | `docs/adr/<issue-number>-<brief-description>.md` |

**Related Ticket** in the ADR header must use that same identifier.

## Copy/paste template

Use this structure for a new ADR file (replace placeholders):

```markdown
**Decision:** <short title>

**Date:** YYYY-MM-DD

**Related Ticket:** <Entry or GitHub issue number from the backlog task that authorizes this ADR>

## Context

What problem or forces led to this decision? What constraints matter?

## Options considered

- **Option A:** …
- **Option B:** …

## Rationale

Why the chosen option wins over the others for this context.

## Final decision

What we decided, in one concrete statement. Link follow-up tasks or risks if needed.
```
