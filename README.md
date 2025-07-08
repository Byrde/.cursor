# Cursor Rules
This repository is meant to be used as a submodule to prime a target repository with cursor rules or effectively commands for running a "software development team". These rules are meant to evolve over time, yet stay consistent across multiple repositories.

## Commands
-  `@init.mdc` - Executes a one-time, comprehensive setup for a new project. It covers the initial planning, architectural design, and scaffolding of the codebase and its supporting tooling. 

- `@plan.mdc` - Engages the Project Manager and Architect to add or refine features by modifying project documentation. This is for all subsequent planning after the initial `init`.

- `@dev.mdc`  - A focused session that engages the Software Engineer archetype to write code and associated unit & integration tests for tasks defined in `@backlog.md`.

- `@test.mdc` - A session that engages the Quality Assurance Professional archetype to execute manual tests against tasks defined in `@backlog.md`.