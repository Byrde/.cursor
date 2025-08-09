# Cursor Rules
This repository is meant to be used as a submodule to prime a target repository with cursor rules or effectively commands for running a "software development team". These rules are meant to evolve over time, yet stay consistent across multiple repositories.

## Usage

Add this repository as a submodule in the root of your target project at the path `.cursor`. The files reference this path internally (e.g., `mdc:.cursor/...`).

### Add the submodule

```bash
git submodule add -b main <this-repo-url> .cursor
git add .gitmodules .cursor
git commit -m "Add Cursor rules submodule"
```

If you already cloned a project that contains this submodule:

```bash
git submodule update --init --recursive
```

### Update the submodule to the latest

```bash
git submodule update --remote --merge .cursor
git add .cursor
git commit -m "Update Cursor rules submodule"
```

Alternatively, inside the submodule:

```bash
cd .cursor && git fetch && git checkout main && git pull && cd -
```

Optional: Ensure `.gitmodules` tracks the desired branch (e.g., `main`) for `.cursor`.

## Commands
-  `@init.mdc` - Executes a one-time, comprehensive setup for a new project. It covers the initial planning, architectural design, and scaffolding of the codebase and its supporting tooling. Run once per project; see `rules/global.mdc` Flow for pre-checks to detect if init has already run.

- `@plan.mdc` - Engages the Project Manager and Architect to add or refine features by modifying project documentation. This is for all subsequent planning after the initial `init`.

- `@prototype.mdc` - Runs a focused prototyping session for a specific backlog task that is in `TODO` and has no existing prototype. Produces a single-file prototype and updates the task’s `Prototype` column in `docs/backlog.md` with the path and brief notes.

- `@dev.mdc`  - A focused session that engages the Software Engineer archetype to write code and associated unit & integration tests for tasks defined in `docs/backlog.md`, leveraging any prototype referenced in the task’s `Prototype` column.

- `@test.mdc` - A session that engages the Quality Assurance Professional archetype to execute manual tests against tasks defined in `docs/backlog.md`.