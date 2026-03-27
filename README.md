# @byrde/cursor

[![npm](https://img.shields.io/npm/v/@byrde/cursor)](https://www.npmjs.com/package/@byrde/cursor)
[![license](https://img.shields.io/npm/l/@byrde/cursor)](./LICENSE)

Bootstrap the Byrde Cursor workflow into any project with one command. It installs the orchestrator, specialist subagents, workflow templates, project config, and MCP setup hooks so a repo opens in Cursor already wired for backlog-driven development.

Everything is project-scoped. Run it in one repository and it installs into that repo's `.cursor/` and `docs/` folders without affecting anything else.

## Usage

```bash
npx @byrde/cursor init [options]
```

| Option | Description |
|---|---|
| `--cwd <path>` | Target project directory. Defaults to the current working directory. |
| `--skip-mcp` | Skip GitHub MCP setup even when the selected backlog provider is GitHub Project (v2) / `github-issues`. |
| `--skip-agent` | Do not launch the Cursor `agent` CLI after install (for CI or when you will complete initialization only in the IDE). |
| `--force` | Overwrite managed files even when local modifications are detected. |
| `--verbose` | Print detailed install, conflict, validation, and scaffold output. |

On first run, `init` runs a short setup, writes **tool-only** `.cursor/workflow.json` (re-runs and questionnaire prepopulation—not read by rules/agents at chat), scaffolds docs for your backlog mode, **renders** `.cursor/` assets with paths and defaults baked in, and (GitHub mode, unless skipped) writes `.cursor/mcp.json`. Bespoke one-off prompts live under `.cursor/prompts/` (for example `project-initialization.md` and `project-migration.md`); they carry the same normalized snapshot for CLI checks as other rendered markdown. By default, `init` launches the Cursor **`agent`** CLI so you can finish overview and design (or a one-time reconciliation session after a confirmed provider/setup transition); backlog planning waits for an explicit later request. Re-runs: reconfigure safely, update managed files, preserve local edits by default; skip the agent step when already initialized except when a transition requires reconciliation.

## What Gets Installed

After `npx @byrde/cursor init`, a project contains:

```text
.cursor/
  agents/
  prompts/
  rules/
  templates/
  workflow.json
  .managed.json
docs/
  overview.md
  design.md
  adr/
    README.md
  testability/
    README.md
```

| Path | Purpose |
|---|---|
| `.cursor/rules/global.mdc` | Orchestrator rule that routes work across planner, `/architect-1`, `/architect-2`, developer, and tester roles. |
| `.cursor/agents/*` | Specialist subagent definitions for planning, architecture (draft and review passes), development, and testing. |
| `.cursor/prompts/*` | One-off session prompts (e.g. greenfield initialization, post-transition setup reconciliation) rendered with baked workflow context—not always-on rules. |
| `.cursor/templates/*` | Template documents used for project planning and setup flows. |
| `.cursor/workflow.json` | Installer-side answers for re-running `init` and prepopulating the questionnaire. Same information is **baked into** rendered `.cursor` markdown at install time; orchestrator rules do not read this file during chat. |
| `.cursor/mcp.json` | Cursor MCP config. Written only when the selected backlog provider is `github-issues` (GitHub Project v2) and MCP setup is not skipped. |
| `.cursor/.managed.json` | Managed-file state used to detect safe updates, local edits, and stale managed files. |
| `docs/*.md`, `docs/adr/README.md`, and `docs/testability/README.md` | Project overview, design, ADR convention README, and testability index. A markdown backlog file is scaffolded only when the selected backlog provider is file-based. `init` does not create individual ADR decision files until a backlog task needs one. |

## Workflow Model

The installed workflow uses an orchestrator plus specialist subagents. Installed rules and agents contain **rendered** backlog location, GitHub Project fields (if applicable), and default review/testing posture—no runtime dependency on `.cursor/workflow.json`:

| Subagent | Purpose |
|---|---|
| `/planner` | Plans new work and populates backlog items. |
| `/architect-1` | **Draft pass** — technical plan, file manifest, reuse analysis, and implementation brief. |
| `/architect-2` | **Review** — pre-development: independently reviews the `/architect-1` draft before `/developer`. Post-development (optional by default): reviews implementation after `/developer` and before `/tester`. |
| `/developer` | Implements backlog tasks and focused fixes. |
| `/tester` | Adversarially verifies behavior and regressions. |

**Model configuration:** `.cursor/workflow.json` (installer-side) includes `workflow.models` with a Cursor model id per role: `planner`, `architect1`, `architect2`, `developer`, and `tester`. The **`architect2`** slot configures **`/architect-2`** (both review modes use the same model id); it defaults to the same model id as **`architect1`** when omitted (older configs used `architect` / `architectReview` keys and normalize on load). **`workflow.defaults.preDevelopmentReview`** and **`workflow.defaults.postDevelopmentReview`** (`required` \| `optional`) control whether the orchestrator runs pre- and post-development **`/architect-2`** by default. Legacy **`workflow.defaults.architectReview`** maps to **`preDevelopmentReview`**. `init` can set these explicitly or accept the recommended defaults.

The orchestrator decides whether to stay in lightweight chat mode, initialize an unplanned project from template-mode docs, plan new work before it enters the backlog, execute the backlog task loop, or run the rapid-fix loop for contained bugs and refinements.

### Architecture Decision Records (ADR)

ADRs are **optional**: only for backlog work explicitly framed as **research**, **spike**, or **decision-record**. Minimal header (**Decision**, **Date**, **Related Ticket**) plus **context**, **options**, **rationale**, **final decision**. Filenames: `docs/adr/<Entry>-<brief-description>.md` (file-backed) or `docs/adr/<issue-number>-<brief-description>.md` (GitHub id). `init` installs `docs/adr/README.md`; no empty ADR stubs until a task needs one.

## Initialization Behavior

Initialization is CLI-driven.

- If workflow assets are missing, run `npx @byrde/cursor init`.
- If workflow assets are installed but `docs/overview.md` is still in template mode (`[Project Name]`), the orchestrator routes through the normal `/planner` then `/architect-1` setup flow, using the backlog source **described in installed rules** (from the last `init` render).

## Updating An Installed Project

Re-run the installer in the target project:

```bash
npx @byrde/cursor init
```

Use `--force` only when you intentionally want to replace managed files that were modified locally. Otherwise, modified managed files are warned about and preserved.

## Development

Single-package TypeScript CLI. Requires Node.js >= 20.

```bash
npm install
npm run typecheck
npm run build
npm test
```
