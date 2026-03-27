import type { MarkdownRenderSpec } from "../domain/asset-manifest.js";
import type { ProjectConfig } from "../domain/config.js";

const MODEL_TOKEN = "{{MODEL}}";

function buildBacklogDetailsMarkdown(config: ProjectConfig): string {
  if (config.backlog.provider === "file") {
    const p = config.backlog.file!.path;
    return [
      `- **Provider:** file-backed markdown.`,
      `- **Path:** \`${p}\` (tasks include a **Priority** column; lower numbers sort earlier).`,
    ].join("\n");
  }

  const g = config.backlog["github-issues"]!;
  const owner = g.projectOwner ?? g.repository.split("/")[0] ?? "";
  const lines: string[] = [
    `- **Provider:** GitHub Issues with GitHub Project (**v2**).`,
    `- **Repository:** \`${g.repository}\`.`,
    `- **Project number:** ${g.projectNumber} (owner: \`${owner}\`).`,
    `- **Order work by Project field:** \`${g.priorityField}\`.`,
    `- **Map workflow state using Project field:** \`${g.statusField}\`.`,
    `- **Map relative size using Project field:** \`${g.sizeField}\` (use **S**, **M**, **L**, **XL** to match file-backed backlog conventions).`,
    `- **Epics:** milestones on issues.`,
  ];
  if (g.label) {
    lines.push(
      `- **Optional label filter:** \`${g.label}\` (Project membership remains primary).`,
    );
  }
  lines.push(
    `- **GitHub MCP server name (for tooling):** \`${g.mcpServerName}\`.`,
  );
  return lines.join("\n");
}

function buildInstalledWorkflowContextSummary(config: ProjectConfig): string {
  const pre = config.workflow.defaults.preDevelopmentReview;
  const post = config.workflow.defaults.postDevelopmentReview;
  const te = config.workflow.defaults.testing;
  if (config.backlog.provider === "file") {
    const p = config.backlog.file!.path;
    return (
      `Backlog: markdown file \`${p}\`. ` +
      `Installed defaults: pre-dev \`/architect-2\` **${pre}**; post-dev \`/architect-2\` **${post}**; adversarial testing **${te}**.`
    );
  }
  const g = config.backlog["github-issues"]!;
  return (
    `Backlog: GitHub Project (v2) **#${g.projectNumber}** in \`${g.repository}\` ` +
    `(priority field \`${g.priorityField}\`, status field \`${g.statusField}\`, size field \`${g.sizeField}\`). ` +
    `Installed defaults: pre-dev \`/architect-2\` **${pre}**; post-dev \`/architect-2\` **${post}**; adversarial testing **${te}**.`
  );
}

function buildTokenMap(
  config: ProjectConfig,
  spec: MarkdownRenderSpec,
): Record<string, string> {
  const map: Record<string, string> = {
    BACKLOG_DETAILS_MARKDOWN: buildBacklogDetailsMarkdown(config),
    DEFAULT_PRE_DEVELOPMENT_REVIEW: config.workflow.defaults.preDevelopmentReview,
    DEFAULT_POST_DEVELOPMENT_REVIEW: config.workflow.defaults.postDevelopmentReview,
    DEFAULT_TESTING: config.workflow.defaults.testing,
    INSTALLED_WORKFLOW_CONTEXT_SUMMARY: buildInstalledWorkflowContextSummary(
      config,
    ),
    BACKLOG_PROVIDER: config.backlog.provider,
    BACKLOG_FILE_PATH:
      config.backlog.provider === "file" ? config.backlog.file!.path : "",
  };

  if (config.backlog.provider === "github-issues") {
    const g = config.backlog["github-issues"]!;
    const owner = g.projectOwner ?? g.repository.split("/")[0] ?? "";
    map.GITHUB_REPOSITORY = g.repository;
    map.GITHUB_PROJECT_NUMBER = String(g.projectNumber);
    map.GITHUB_PROJECT_OWNER = owner;
    map.GITHUB_PRIORITY_FIELD = g.priorityField;
    map.GITHUB_STATUS_FIELD = g.statusField;
    map.GITHUB_SIZE_FIELD = g.sizeField;
    map.GITHUB_LABEL = g.label ?? "";
    map.GITHUB_MCP_SERVER_NAME = g.mcpServerName;
  } else {
    map.GITHUB_REPOSITORY = "";
    map.GITHUB_PROJECT_NUMBER = "";
    map.GITHUB_PROJECT_OWNER = "";
    map.GITHUB_PRIORITY_FIELD = "";
    map.GITHUB_STATUS_FIELD = "";
    map.GITHUB_SIZE_FIELD = "";
    map.GITHUB_LABEL = "";
    map.GITHUB_MCP_SERVER_NAME = "";
  }

  if (spec.agentRole !== undefined) {
    map.MODEL = config.workflow.models[spec.agentRole];
  }

  return map;
}

/**
 * Expands `{{TOKEN}}` placeholders using normalized `ProjectConfig` and optional
 * `agentRole` for `{{MODEL}}`. Throws if required placeholders are missing or
 * any `{{NAME}}` remains unknown after substitution.
 */
export function renderWorkflowMarkdownAsset(
  templateUtf8: string,
  config: ProjectConfig,
  spec: MarkdownRenderSpec,
): string {
  const hasModelPlaceholder = templateUtf8.includes(MODEL_TOKEN);
  if (spec.agentRole !== undefined) {
    if (!hasModelPlaceholder) {
      throw new Error(
        `Markdown template for role "${spec.agentRole}" is missing ${MODEL_TOKEN} placeholder`,
      );
    }
  } else if (hasModelPlaceholder) {
    throw new Error(
      `Template contains ${MODEL_TOKEN} but no agentRole was provided in render spec`,
    );
  }

  const tokens = buildTokenMap(config, spec);
  let out = templateUtf8;
  const keys = Object.keys(tokens).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const value = tokens[key];
    if (value === undefined) {
      continue;
    }
    out = out.split(`{{${key}}}`).join(value);
  }

  const unresolved = out.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (unresolved?.length) {
    throw new Error(
      `Unresolved workflow template placeholders: ${unresolved.join(", ")}`,
    );
  }

  if (spec.embedInitProjectConfigSnapshot) {
    const encoded = Buffer.from(JSON.stringify(config), "utf8").toString("base64");
    out += `\n\n<!-- byrde:installed-project-config v1\n${encoded}\n-->\n`;
  }

  return out;
}
