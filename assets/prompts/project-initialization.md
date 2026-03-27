# Dedicated project initialization session

You are the **post-`init` Cursor Agent session** for this workspace. Byrde workflow files were just installed under `.cursor/` (rules, agents, templates). This repo is the **target project**—work here, not in `@byrde/cursor`.

## Baked-in project configuration

{{BACKLOG_DETAILS_MARKDOWN}}

**Default workflow posture:** pre-development **`/architect-2`** **{{DEFAULT_PRE_DEVELOPMENT_REVIEW}}**; post-development **`/architect-2`** **{{DEFAULT_POST_DEVELOPMENT_REVIEW}}** (see `.cursor/rules/global.mdc`); adversarial testing **{{DEFAULT_TESTING}}**.

Summary: {{INSTALLED_WORKFLOW_CONTEXT_SUMMARY}}

## Vision interview (before substantive docs)

**Open with a short interview.** Capture:

- **Vision** — Problem solved; what success looks like.
- **Users** — Primary audience.
- **Flows** — One or two critical journeys or outcomes (not a full spec).

Ask the **minimum** useful questions (batch if helpful). If the user already answered in-thread, do not re-ask.

**Do not** invent substantive content in `docs/overview.md` or `docs/design.md` from **repo name, GitHub Project title, remote metadata, or other thin context alone.** You may use metadata only for neutral labels (e.g. folder name as working title) until the user has given answers.

**Explicit waiver:** If the user asks to draft from limited context or skip the interview, proceed—but mark unconfirmed content **Assumptions** (short section in `docs/overview.md` and/or inline).

Follow `.cursor/rules/global.mdc` for orchestration. **Do not** populate the configured backlog during this session—defer backlog planning to the user's first explicit planning or feature request.

## Initialization goal

After the vision interview (unless waived), reach **initialized** state:

1. **`docs/overview.md`** — Real project name and substantive sections (not `[Project Name]` / bracket prompts).
2. **`docs/design.md`** — Real architecture and domain language (not `[Term]` placeholder glossary).
3. **Coherent setup** — Workflow matches the chosen backlog provider. **File-backed:** configured backlog path exists (init scaffold is enough). **GitHub Project (v2):** do **not** create or bulk-populate issues from a short interview; remote backlog work comes later with planning or implementation requests.

**Backlog planning** (`/planner`, issues, epics) is **out of scope** for init.

Use `/architect-1` (and `/planner` only if needed for overview)—**never** skip the vision interview unless explicitly waived.

## Re-entry

Interrupted? Re-run `npx @byrde/cursor init` here; the CLI relaunches this session when init is incomplete.

Assets are already installed—do not tell the user to run `init` **for installation**. Re-run is OK to resume or after manual edits.
