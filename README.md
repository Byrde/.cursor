# @byrde/cursor

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
| `--force` | Overwrite managed files even when local modifications are detected. |
| `--verbose` | Print detailed install, conflict, validation, and scaffold output. |

On first run, `init` guides you through a short setup flow, writes `.cursor/workflow.json`, scaffolds template docs that match your backlog choice, installs workflow assets into `.cursor/`, and, when you choose a GitHub-backed backlog, writes `.cursor/mcp.json` to enable the GitHub MCP server. Re-running the command lets you keep or reconfigure the existing workflow setup, updates managed files safely, and preserves local changes by default.

## What Gets Installed

After `npx @byrde/cursor init`, a project contains:

```text
.cursor/
  agents/
  rules/
  templates/
  workflow.json
  .managed.json
docs/
  overview.md
  design.md
  testability/
    README.md
```

| Path | Purpose |
|---|---|
| `.cursor/rules/global.mdc` | Orchestrator rule that routes work across planner, architect, developer, and tester roles. |
| `.cursor/rules/init.mdc` | Lightweight fallback that points users to the CLI installer. |
| `.cursor/agents/*` | Specialist subagent definitions for planning, architecture, development, and testing. |
| `.cursor/templates/*` | Template documents used for project planning and setup flows. |
| `.cursor/workflow.json` | Project workflow configuration: backlog provider/location plus default architect-review and testing behavior. |
| `.cursor/mcp.json` | Cursor MCP config. Written only when the selected backlog provider is `github-issues` (GitHub Project v2) and MCP setup is not skipped. |
| `.cursor/.managed.json` | Managed-file state used to detect safe updates, local edits, and stale managed files. |
| `docs/*.md` and `docs/testability/README.md` | Project overview, design, and testability index. A markdown backlog file is scaffolded only when the selected backlog provider is file-based. |

## Workflow Model

The installed workflow uses an orchestrator plus specialist subagents, guided by `.cursor/workflow.json`:

| Subagent | Purpose |
|---|---|
| `/planner` | Plans new work and populates backlog items. |
| `/architect` | Drafts and reviews technical approaches before implementation. |
| `/developer` | Implements backlog tasks and focused fixes. |
| `/tester` | Adversarially verifies behavior and regressions. |

The orchestrator decides whether to stay in lightweight chat mode, initialize an unplanned project from template-mode docs, plan new work before it enters the backlog, execute the backlog task loop, or run the rapid-fix loop for contained bugs and refinements.

## Initialization Behavior

Initialization is CLI-driven.

- If workflow assets are missing, run `npx @byrde/cursor init`.
- If workflow assets are installed but `docs/overview.md` is still in template mode (`[Project Name]`), the orchestrator routes through the normal `/planner` then `/architect` setup flow, using the configured backlog source from `.cursor/workflow.json`.
- `@init.mdc` no longer contains the old embedded setup conversation; it now serves only as a lightweight discoverability stub.

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

### CI on this repository

GitHub Actions (`.github/workflows/ci.yml`, push to `main` only) runs a mandatory **`build-and-test`** job (install, typecheck, build, test). Release automation (`semantic-release`, then `npm publish` when a version is produced) depends only on that baseline. **`architect-review`** and **`feature-verification`** are separate visible checks that always run lightweight documentation verification and are not release gates.

Contributor-facing package layout:

```text
assets/
  agents/
  rules/
  templates/
src/
  api/
  domain/
  infrastructure/
docs/
  overview.md
  design.md
  backlog.md
  testability/
    README.md
```

`assets/` is the single source of truth for installable workflow files. The repo-local `.cursor/` directory is the dogfooding copy used while developing the package itself.
