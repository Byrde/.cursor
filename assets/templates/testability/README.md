# Testability index

Record how AI verifies each feature using shell commands. Prefer **one markdown file per feature** in this directory.

In repositories that use Byrde’s GitHub Actions layout, the mandatory baseline is the **`build-and-test`** job. **`architect-review`** and **`feature-verification`** are additional visible checks that always run lightweight documentation verification and are not release gates.

## Naming

Use `{FEATURE_NUMBER}-{BRIEF_DESCRIPTION}.md` (for example `001-cli-auth.md`). `FEATURE_NUMBER` is a stable project-local identifier (often zero-padded or backlog-derived). `BRIEF_DESCRIPTION` is a short kebab-case slug.

Optionally keep this `README.md` as a short index that links to active feature files.

## What to capture (per feature file)

Use the sections below as a checklist; omit sections that do not apply.

### Quick entry

| Feature | Verification command | Type |
| :--- | :--- | :--- |
| [Feature name] | `[shell command]` | Standard |
| [Feature name] | See Long-Running section below | Long-running |
| [Feature name] | See User-in-the-loop section below | User action required |

## Standard verifications

### [Feature name]

```bash
# Command to verify feature
[command with arguments]
```

**Expected output:** [What success looks like]

## Long-running process verifications

For services, servers, or processes that do not exit immediately.

### [Feature name]

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

### [Feature name]

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
