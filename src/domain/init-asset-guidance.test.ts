import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("prompt assets", () => {
  it("project-initialization requires a vision interview before substantive docs and forbids metadata-only invention", () => {
    const content = readFileSync(
      path.join(packageRoot, "assets/prompts/project-initialization.md"),
      "utf8",
    );
    expect(content).toContain("## Vision interview");
    expect(content).toMatch(/Do not.*invent substantive/i);
    expect(content).toMatch(/Assumptions/i);
  });

  it("project-initialization defers backlog planning to after init", () => {
    const content = readFileSync(
      path.join(packageRoot, "assets/prompts/project-initialization.md"),
      "utf8",
    );
    expect(content).toMatch(/Do not.*populate the configured backlog during/i);
    expect(content).toMatch(/Backlog planning.*out of scope/i);
  });

  it("project-migration is a one-time reconciliation session, not an always-on rule", () => {
    const content = readFileSync(
      path.join(packageRoot, "assets/prompts/project-migration.md"),
      "utf8",
    );
    expect(content).toMatch(/one-time reconciliation prompt/i);
    expect(content).toMatch(/not.*always-on rule/i);
    expect(content).toContain("{{BACKLOG_DETAILS_MARKDOWN}}");
  });

  it("project-migration prescribes backlog provider transitions, field mapping, and artifact renames", () => {
    const content = readFileSync(
      path.join(packageRoot, "assets/prompts/project-migration.md"),
      "utf8",
    );
    expect(content).toMatch(/Backlog provider transition/i);
    expect(content).toMatch(/Field mapping/i);
    expect(content).toMatch(/docs\/testability\/<backlog-id>/i);
    expect(content).toMatch(/docs\/adr\/<backlog-id>/i);
    expect(content).toMatch(/File-backed.*GitHub|GitHub.*File-backed/i);
  });
});
