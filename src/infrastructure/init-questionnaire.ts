import type { Status } from "@inquirer/core";
import { confirm, input, password, select } from "@inquirer/prompts";
import { styleText } from "node:util";
import {
  createDefaultProjectConfig,
  normalizeProjectConfig,
  type BacklogProviderKind,
  type ProjectConfig,
  type WorkflowDefaultMode,
  type WorkflowModels,
} from "../domain/config.js";
import {
  listGitHubAccounts,
  resolveGitHubTokenForAccount,
  type GitHubAccount,
} from "./github-auth.js";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export type ClientTarget = "cursor";

export interface QuestionnairePrompts {
  readonly select: typeof select;
  readonly input: typeof input;
  readonly confirm: typeof confirm;
  readonly password: typeof password;
}

export interface InitQuestionnaireOptions {
  readonly cwd: string;
  readonly existingConfig?: ProjectConfig;
}

export interface InitQuestionnaireResult {
  readonly projectConfig: ProjectConfig;
  readonly shouldWriteProjectConfig: boolean;
  readonly githubMcpToken?: string;
}

const DEFAULT_PROMPTS: QuestionnairePrompts = {
  select,
  input,
  confirm,
  password,
};

export async function runInitQuestionnaire(
  options: InitQuestionnaireOptions,
  prompts: QuestionnairePrompts = DEFAULT_PROMPTS,
): Promise<InitQuestionnaireResult> {
  printBanner();

  const existingConfig = options.existingConfig;
  if (existingConfig) {
    const reconfigure = await prompts.confirm({
      message: "Reconfigure workflow setup (.cursor/workflow.json)?",
      default: false,
    });

    if (!reconfigure) {
      return {
        projectConfig: normalizeProjectConfig(existingConfig),
        shouldWriteProjectConfig: false,
      };
    }
  }

  const projectConfig = await promptProjectConfig(
    existingConfig ?? createDefaultProjectConfig(),
    prompts,
  );
  const githubMcpToken = projectConfig.backlog.provider === "github-issues"
    ? await promptGitHubMcpToken(prompts)
    : undefined;

  return {
    projectConfig,
    shouldWriteProjectConfig: true,
    githubMcpToken,
  };
}

async function promptProjectConfig(
  defaults: ProjectConfig,
  prompts: QuestionnairePrompts,
): Promise<ProjectConfig> {
  const provider = await prompts.select({
    message: "Which backlog style should this project use?",
    choices: [
      {
        name: "Markdown file in the repository",
        description: "Track work in a markdown backlog file that the workflow updates directly.",
        value: "file",
      },
      {
        name: "GitHub Project (v2) + issues",
        description:
          "Track work in a GitHub Project (v2): milestones = epics, Project Priority orders work, Project Status maps to workflow state. Uses GitHub MCP instead of a local backlog file.",
        value: "github-issues",
      },
    ],
    default: defaults.backlog.provider,
  }) as BacklogProviderKind;

  const backlog = await promptBacklogConfig(provider, defaults, prompts);
  const architectReview = await promptDefaultMode(
    "Default architect review behavior?",
    defaults.workflow.defaults.architectReview,
    prompts,
    {
      required: "Require a second architect review by default",
      optional: "Let the orchestrator skip architect review by default when the task is clearly small and low-risk",
    },
  );
  const testing = await promptDefaultMode(
    "Default adversarial testing behavior?",
    defaults.workflow.defaults.testing,
    prompts,
    {
      required: "Require `/tester` by default",
      optional: "Let the orchestrator skip `/tester` by default when developer verification is sufficient",
    },
  );

  const models = await promptWorkflowModels(defaults.workflow.models, prompts);

  return {
    backlog,
    workflow: {
      defaults: {
        architectReview,
        testing,
      },
      models,
    },
  };
}

async function promptWorkflowModels(
  defaults: WorkflowModels,
  prompts: QuestionnairePrompts,
): Promise<WorkflowModels> {
  const useRecommended = await prompts.confirm({
    message:
      "Use recommended Cursor models for /planner, /architect, /developer, and /tester?",
    default: true,
  });

  if (useRecommended) {
    return defaults;
  }

  const planner = (
    await prompts.input({
      message: "Model id for /planner:",
      default: defaults.planner,
      validate: (value) =>
        value.trim() ? true : "Enter a model id (see Cursor docs).",
    })
  ).trim();

  const architect = (
    await prompts.input({
      message: "Model id for /architect:",
      default: defaults.architect,
      validate: (value) =>
        value.trim() ? true : "Enter a model id (see Cursor docs).",
    })
  ).trim();

  const developer = (
    await prompts.input({
      message: "Model id for /developer:",
      default: defaults.developer,
      validate: (value) =>
        value.trim() ? true : "Enter a model id (see Cursor docs).",
    })
  ).trim();

  const tester = (
    await prompts.input({
      message: "Model id for /tester:",
      default: defaults.tester,
      validate: (value) =>
        value.trim() ? true : "Enter a model id (see Cursor docs).",
    })
  ).trim();

  return { planner, architect, developer, tester };
}

async function promptBacklogConfig(
  provider: BacklogProviderKind,
  defaults: ProjectConfig,
  prompts: QuestionnairePrompts,
): Promise<ProjectConfig["backlog"]> {
  if (provider === "github-issues") {
    const githubDefaults = defaults.backlog["github-issues"];
    const repository = (await prompts.input({
      message: "GitHub repository for issues (owner/name):",
      default: githubDefaults?.repository ?? "",
      validate: (value) =>
        value.trim().match(/^[^/\s]+\/[^/\s]+$/)
          ? true
          : "Use the form owner/name.",
    })).trim();

    const projectNumberStr = await prompts.input({
      message: "GitHub Project (v2) number:",
      default: githubDefaults?.projectNumber != null
        ? String(githubDefaults.projectNumber)
        : "",
      validate: (value) => {
        const n = Number.parseInt(value.trim(), 10);
        return Number.isFinite(n) && n > 0
          ? true
          : "Enter a positive Project number (from the Projects tab).";
      },
    });
    const projectNumber = Number.parseInt(projectNumberStr.trim(), 10);

    const projectOwner = (await prompts.input({
      message:
        "Project owner (org or user login; leave blank to use the repository owner):",
      default: githubDefaults?.projectOwner ?? "",
    })).trim();

    const priorityField = (await prompts.input({
      message: "Project field name for backlog ordering:",
      default: githubDefaults?.priorityField ?? "Priority",
      validate: (value) =>
        value.trim() ? true : "Field name is required.",
    })).trim();

    const statusField = (await prompts.input({
      message: "Project field name for workflow status:",
      default: githubDefaults?.statusField ?? "Status",
      validate: (value) =>
        value.trim() ? true : "Field name is required.",
    })).trim();

    const labelRaw = (await prompts.input({
      message:
        "Optional issue label filter (leave blank for none; secondary to Project items):",
      default: githubDefaults?.label ?? "",
    })).trim();

    return {
      provider,
      "github-issues": {
        repository,
        projectNumber,
        ...(projectOwner.trim().length > 0
          ? { projectOwner: projectOwner.trim() }
          : {}),
        priorityField,
        statusField,
        ...(labelRaw.trim().length > 0 ? { label: labelRaw.trim() } : {}),
        mcpServerName: githubDefaults?.mcpServerName ?? "github",
      },
    };
  }

  const fileDefaults = defaults.backlog.file;
  const backlogPath = (await prompts.input({
    message: "Backlog file path:",
    default: fileDefaults?.path ?? "docs/backlog.md",
    validate: (value) => value.trim() ? true : "Path is required.",
  })).trim();

  return {
    provider,
    file: {
      path: backlogPath,
    },
  };
}

type GitHubMcpAuthChoice =
  | { readonly kind: "env" }
  | { readonly kind: "gh-account"; readonly account: string }
  | { readonly kind: "manual" };

const GITHUB_MCP_AUTH_QUESTION =
  "How should Cursor authenticate to GitHub for the MCP server?";

const GITHUB_MCP_TOKEN_PROMPT =
  "GitHub personal access token for the Cursor MCP server:";

function formatGitHubMcpContextBlock(): string {
  return (
    `${BOLD}GitHub MCP${RESET}\n` +
    `${DIM}The GitHub MCP server needs a token so Cursor can reach your repository, Project (v2), and issues.${RESET}`
  );
}

function githubMcpAuthSelectMessage(): string {
  return `${formatGitHubMcpContextBlock()}\n\n${GITHUB_MCP_AUTH_QUESTION}`;
}

function githubMcpAuthSelectTheme() {
  return {
    style: {
      message: (text: string, status: Status) => {
        if (status === "done") {
          return styleText("bold", GITHUB_MCP_AUTH_QUESTION);
        }
        return text;
      },
    },
  };
}

function githubMcpPasswordMessageNoGhAccounts(): string {
  return (
    `${formatGitHubMcpContextBlock()}\n\n` +
    `${DIM}No GitHub CLI accounts were found (install \`gh\` and run \`gh auth login\` to sign in).${RESET}\n` +
    `${DIM}You can paste a fine-grained or classic PAT with repo scope for the MCP GitHub server.${RESET}\n\n` +
    `${GITHUB_MCP_TOKEN_PROMPT}`
  );
}

function githubMcpPasswordTheme() {
  return {
    style: {
      message: (text: string, status: Status) => {
        if (status === "done") {
          return styleText("bold", GITHUB_MCP_TOKEN_PROMPT);
        }
        return text;
      },
    },
  };
}

function maskTokenHint(token: string): string {
  const t = token.trim();
  if (t.length <= 8) {
    return "…";
  }
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

function formatAccountChoice(a: GitHubAccount): string {
  const active = a.active ? " — active" : "";
  return `${a.account} @ ${a.host}${active}`;
}

async function promptGitHubMcpToken(
  prompts: QuestionnairePrompts,
): Promise<string> {
  const envToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim();
  const accounts = await listGitHubAccounts();

  const choices: Array<{ name: string; value: GitHubMcpAuthChoice }> = [];

  if (envToken) {
    choices.push({
      name: `Use GITHUB_PERSONAL_ACCESS_TOKEN from the environment (${maskTokenHint(envToken)})`,
      value: { kind: "env" },
    });
  }

  for (const account of accounts) {
    choices.push({
      name: formatAccountChoice(account),
      value: { kind: "gh-account", account: account.account },
    });
  }

  choices.push({
    name: "Enter a personal access token manually",
    value: { kind: "manual" },
  });

  if (accounts.length === 0 && !envToken) {
    return (await prompts.password({
      message: githubMcpPasswordMessageNoGhAccounts(),
      theme: githubMcpPasswordTheme(),
      validate: (value) => value.trim() ? true : "GitHub token is required.",
    })).trim();
  }

  const selected = await prompts.select({
    message: githubMcpAuthSelectMessage(),
    choices,
    theme: githubMcpAuthSelectTheme(),
  }) as GitHubMcpAuthChoice;

  if (selected.kind === "env") {
    return envToken!;
  }

  if (selected.kind === "manual") {
    return (await prompts.password({
      message: GITHUB_MCP_TOKEN_PROMPT,
      validate: (value) => value.trim() ? true : "GitHub token is required.",
    })).trim();
  }

  const resolved = await resolveGitHubTokenForAccount(selected.account);
  if (resolved) {
    return resolved;
  }

  console.warn(
    `${BOLD}Could not read a token for that account via \`gh auth token\`.${RESET} ` +
      `${DIM}Sign in with \`gh auth login\` or enter a token below.${RESET}`,
  );
  return (await prompts.password({
    message: GITHUB_MCP_TOKEN_PROMPT,
    validate: (value) => value.trim() ? true : "GitHub token is required.",
  })).trim();
}

async function promptDefaultMode(
  message: string,
  defaultValue: WorkflowDefaultMode,
  prompts: QuestionnairePrompts,
  labels: Record<WorkflowDefaultMode, string>,
): Promise<WorkflowDefaultMode> {
  return prompts.select({
    message,
    choices: [
      { name: labels.required, value: "required" },
      { name: labels.optional, value: "optional" },
    ],
    default: defaultValue,
  }) as Promise<WorkflowDefaultMode>;
}

function printBanner(): void {
  console.log(`
  ${BOLD}@byrde/cursor${RESET}
  ${DIM}Install and configure the workflow so the project starts with the
  right backlog, review, testing, and GitHub tooling from day one.${RESET}
`);
}
