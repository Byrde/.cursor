# Testability index

Prefer **one markdown file per task**, keyed to the backlog id, with shell-oriented verification steps.

Repos using Byrde’s GitHub Actions: mandatory **`build-and-test`** is the baseline CI verification job. Release and publish automation depend on that baseline as configured by the repository.

## Naming

Use `<backlog-id>-<brief-description>.md`, where:

- **File-backed backlog:** `<backlog-id>` is the task’s **`Entry`** (typically zero-padded, e.g. `025`).
- **GitHub-backed backlog:** `<backlog-id>` is the **GitHub issue number** for that task.

`<brief-description>` is a short kebab-case slug. Example (file-backed): `025-init-classification.md`. Example (GitHub-backed): `42-oauth-flow.md`.

Optionally keep this `README.md` as a short index that links to active task files.

## What to capture (per task file)

Use the sections below as a checklist; omit sections that do not apply.

### Quick entry

| Task | Verification command | Type |
| :--- | :--- | :--- |
| [Task / scope] | `[shell command]` | Standard |
| [Task / scope] | See Long-Running section below | Long-running |
| [Task / scope] | See User-in-the-loop section below | User action required |

## Standard verifications

### [Task or scope name]

```bash
# Command to verify feature
[command with arguments]
```

**Expected output:** [What success looks like]

## Long-running process verifications

For services, servers, or processes that do not exit immediately.

### [Task or scope name]

**Start:**

```bash
timeout 30 ./start-service &
```

**Verify:**

```bash
curl -f http://localhost:8080/health
```

**Stop:**

```bash
kill %1
```

**Notes:** [Special considerations]

## User-in-the-loop verifications

For OAuth, hardware, visual checks, etc.

### [Task or scope name]

**AI setup:**

```bash
[setup commands]
```

**User action required:**

> [What the user must do]

**AI verification** (after the user confirms):

```bash
[verification commands]
```

**Expected result:** [Success criteria]

## Environment setup

### Prerequisites

- [Dependency]

### Before testing

```bash
[setup]
```

### Cleanup

```bash
[cleanup]
```
