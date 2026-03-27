import type { BacklogProvider } from "../domain/backlog/provider.js";
import type { GitHubIssuesBacklogConfig } from "../domain/config.js";
import {
  DEFAULT_TASK_PRIORITY,
  TASK_STATUS_VALUES,
  type NewTask,
  type Task,
  type TaskFilter,
  type TaskStatus,
  type TaskStatusTransition,
} from "../domain/backlog/types.js";
import {
  GitHubProjectFieldError,
  type ResolvedProjectField,
  requireSingleSelectOptionId,
  resolveNamedProjectField,
} from "./github-project-v2-fields.js";

export class GitHubBacklogError extends Error {
  override readonly name = "GitHubBacklogError";
  constructor(message: string) {
    super(message);
  }
}

export type GitHubGraphQlExecutor = (
  query: string,
  variables?: Record<string, unknown>,
) => Promise<unknown>;

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUS_VALUES as readonly string[]).includes(value);
}

function splitRepo(repository: string): { owner: string; name: string } {
  const parts = repository.split("/");
  if (parts.length !== 2 || !parts[0]!.trim() || !parts[1]!.trim()) {
    throw new GitHubBacklogError(
      `Invalid repository "${repository}" (expected owner/name).`,
    );
  }
  return { owner: parts[0]!.trim(), name: parts[1]!.trim() };
}

function projectOwnerLogin(cfg: GitHubIssuesBacklogConfig): string {
  const { owner } = splitRepo(cfg.repository);
  return (cfg.projectOwner ?? owner).trim();
}

function buildDefaultFetchExecutor(token: string): GitHubGraphQlExecutor {
  return async (query, variables = {}) => {
    const t = token.trim();
    if (!t) {
      throw new GitHubBacklogError(
        "GitHub backlog provider requires authentication (set a token or GITHUB_PERSONAL_ACCESS_TOKEN).",
      );
    }
    const res = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        "User-Agent": "byrde-cursor-github-backlog",
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as {
      data?: unknown;
      errors?: readonly { message?: string }[];
    };
    if (!res.ok) {
      throw new GitHubBacklogError(
        `GitHub GraphQL HTTP ${String(res.status)}: ${JSON.stringify(json)}`,
      );
    }
    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message ?? "?").join("; ");
      throw new GitHubBacklogError(`GitHub GraphQL error: ${msg}`);
    }
    return json.data;
  };
}

interface ProjectContext {
  readonly projectId: string;
  readonly projectOwnerType: "organization" | "user";
  readonly priority: ResolvedProjectField;
  readonly status: ResolvedProjectField;
  readonly size: ResolvedProjectField;
}

const ACCEPTANCE_CRITERIA_HEADER = /^##\s+Acceptance Criteria\s*$/;

function normalizeChecklistText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Split the issue body so the `## Acceptance Criteria` block can be edited in isolation.
 */
function parseAcceptanceCriteriaSection(body: string): {
  prefix: string;
  sectionLines: string[];
  suffix: string;
} | null {
  const lines = body.split(/\r?\n/);
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (ACCEPTANCE_CRITERIA_HEADER.test(lines[i]!.trim())) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) {
    return null;
  }
  const contentStart = headerIndex + 1;
  let contentEnd = lines.length;
  for (let i = contentStart; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) {
      contentEnd = i;
      break;
    }
  }
  const prefix = lines.slice(0, contentStart).join("\n");
  const sectionLines = lines.slice(contentStart, contentEnd);
  const suffix = lines.slice(contentEnd).join("\n");
  return { prefix, sectionLines, suffix };
}

function rebuildBodyWithAcceptanceSection(
  prefix: string,
  sectionLines: string[],
  suffix: string,
): string {
  const parts: string[] = [prefix];
  if (sectionLines.length > 0) {
    parts.push(sectionLines.join("\n"));
  }
  if (suffix.length > 0) {
    parts.push(suffix);
  }
  return parts.join("\n");
}

const TASK_LIST_ITEM = /^(\s*[-*]\s*)\[( |x|X)\]\s*(.*)$/;

function reconcileAcceptanceCriteriaSectionLines(
  sectionLines: string[],
  checklist: ReadonlyArray<{ text: string; checked: boolean }>,
): string[] {
  const out = [...sectionLines];
  const used = new Set<number>();
  for (const item of checklist) {
    const target = normalizeChecklistText(item.text);
    let found = -1;
    for (let i = 0; i < out.length; i++) {
      if (used.has(i)) {
        continue;
      }
      const m = out[i]!.match(TASK_LIST_ITEM);
      if (!m) {
        continue;
      }
      if (normalizeChecklistText(m[3] ?? "") !== target) {
        continue;
      }
      found = i;
      break;
    }
    if (found < 0) {
      throw new GitHubBacklogError(
        `Could not find workflow checklist item in "## Acceptance Criteria": "${item.text}"`,
      );
    }
    used.add(found);
    const line = out[found]!;
    const m = line.match(TASK_LIST_ITEM)!;
    const mark = item.checked ? "x" : " ";
    out[found] = `${m[1]}[${mark}] ${m[3]}`;
  }
  return out;
}

function verifyAllWorkflowTargetsChecked(
  sectionLines: string[],
  checklist: ReadonlyArray<{ text: string; checked: boolean }>,
): void {
  for (const item of checklist) {
    const target = normalizeChecklistText(item.text);
    let ok = false;
    for (const line of sectionLines) {
      const m = line.match(TASK_LIST_ITEM);
      if (!m) {
        continue;
      }
      if (normalizeChecklistText(m[3] ?? "") !== target) {
        continue;
      }
      if ((m[2] ?? "").toLowerCase() !== "x") {
        throw new GitHubBacklogError(
          `Cannot complete task: workflow checklist item is not checked: "${item.text}"`,
        );
      }
      ok = true;
      break;
    }
    if (!ok) {
      throw new GitHubBacklogError(
        `Cannot complete task: workflow checklist item not found in "## Acceptance Criteria": "${item.text}"`,
      );
    }
  }
}

interface IssueUpdateContext {
  readonly issueId: string;
  readonly body: string;
  readonly itemId: string;
}

export class GitHubIssuesBacklogProvider implements BacklogProvider {
  private readonly cfg: GitHubIssuesBacklogConfig;
  private readonly gql: GitHubGraphQlExecutor;
  private projectCache: Promise<ProjectContext> | undefined;

  constructor(
    config: GitHubIssuesBacklogConfig,
    token: string,
    options?: { readonly graphQl?: GitHubGraphQlExecutor },
  ) {
    this.cfg = config;
    this.gql = options?.graphQl ?? buildDefaultFetchExecutor(token);
  }

  private async loadProjectContext(): Promise<ProjectContext> {
    const login = projectOwnerLogin(this.cfg);
    const n = this.cfg.projectNumber;

    const orgQuery = `
      query($login: String!, $n: Int!) {
        organization(login: $login) {
          projectV2(number: $n) {
            id
            fields(first: 100) {
              nodes {
                __typename
                ... on ProjectV2FieldCommon { name }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options { id name }
                }
                ... on ProjectV2NumberField {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `;
    const userQuery = `
      query($login: String!, $n: Int!) {
        user(login: $login) {
          projectV2(number: $n) {
            id
            fields(first: 100) {
              nodes {
                __typename
                ... on ProjectV2FieldCommon { name }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options { id name }
                }
                ... on ProjectV2NumberField {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `;

    let data = (await this.gql(orgQuery, { login, n })) as Record<
      string,
      unknown
    >;
    let orgOrUser = data.organization as Record<string, unknown> | null | undefined;
    let project = orgOrUser?.projectV2 as Record<string, unknown> | null | undefined;
    let ownerType: "organization" | "user" = "organization";

    if (!project?.id) {
      data = (await this.gql(userQuery, { login, n })) as Record<string, unknown>;
      const user = data.user as Record<string, unknown> | null | undefined;
      project = user?.projectV2 as Record<string, unknown> | null | undefined;
      ownerType = "user";
    }

    if (!project?.id) {
      throw new GitHubBacklogError(
        `GitHub Project #${String(n)} was not found for owner "${login}" (check project number and projectOwner).`,
      );
    }

    const fieldNodes = (project.fields as { nodes?: unknown[] } | undefined)?.nodes ??
      [];
    let priority: ResolvedProjectField;
    let status: ResolvedProjectField;
    let size: ResolvedProjectField;
    try {
      priority = resolveNamedProjectField(
        fieldNodes,
        this.cfg.priorityField,
        "number",
      );
      status = resolveNamedProjectField(
        fieldNodes,
        this.cfg.statusField,
        "singleSelect",
      );
      size = resolveNamedProjectField(
        fieldNodes,
        this.cfg.sizeField,
        "singleSelect",
      );
    } catch (e) {
      if (e instanceof GitHubProjectFieldError) {
        throw new GitHubBacklogError(e.message);
      }
      throw e;
    }

    return {
      projectId: String(project.id),
      projectOwnerType: ownerType,
      priority,
      status,
      size,
    };
  }

  private async project(): Promise<ProjectContext> {
    if (!this.projectCache) {
      this.projectCache = this.loadProjectContext();
    }
    return this.projectCache;
  }

  private async repositoryNodeId(): Promise<string> {
    const { owner, name } = splitRepo(this.cfg.repository);
    const q = `
      query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
        }
      }
    `;
    const data = (await this.gql(q, { owner, name })) as {
      repository?: { id?: string } | null;
    };
    const id = data.repository?.id;
    if (!id) {
      throw new GitHubBacklogError(
        `Repository "${this.cfg.repository}" was not found or is not accessible.`,
      );
    }
    return id;
  }

  private extractFieldValues(
    fieldValueNodes: readonly unknown[],
    ctx: ProjectContext,
  ): { priority: number; status: TaskStatus; size: string } {
    let priority = DEFAULT_TASK_PRIORITY;
    let statusRaw = "TODO";
    let size = "";

    for (const raw of fieldValueNodes) {
      const node = raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : undefined;
      if (!node) {
        continue;
      }
      const field = node.field as Record<string, unknown> | undefined;
      const fieldName = field && typeof field.name === "string"
        ? field.name.trim()
        : "";

      if ("number" in node && typeof node.number === "number") {
        if (fieldName === ctx.priority.name) {
          priority = Math.trunc(node.number);
        }
      }
      if ("name" in node && typeof node.name === "string") {
        if (fieldName === ctx.status.name) {
          statusRaw = node.name.trim();
        }
        if (fieldName === ctx.size.name) {
          size = node.name.trim();
        }
      }
    }

    if (!isTaskStatus(statusRaw)) {
      throw new GitHubBacklogError(
        `Invalid Status value "${statusRaw}" from Project field "${ctx.status.name}" (expected one of: ${TASK_STATUS_VALUES.join(", ")}).`,
      );
    }

    return { priority, status: statusRaw, size };
  }

  private mapIssueToTask(
    issue: {
      number: number;
      title: string;
      body?: string | null;
      milestone?: { title?: string | null } | null;
    },
    fieldValues: readonly unknown[],
    ctx: ProjectContext,
  ): Task {
    const { priority, status, size } = this.extractFieldValues(
      fieldValues,
      ctx,
    );
    const epic = issue.milestone?.title?.trim() ?? "";
    const body = issue.body?.trim() ?? "";
    return {
      id: String(issue.number),
      epic,
      priority,
      size,
      description: issue.title.trim(),
      acceptanceCriteria: body,
      status,
      prototype: "",
      notes: "",
    };
  }

  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    const ctx = await this.project();
    const login = projectOwnerLogin(this.cfg);
    const itemsQuery = `
      query($login: String!, $n: Int!, $first: Int!, $after: String) {
        organization(login: $login) {
          projectV2(number: $n) {
            items(first: $first, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                fieldValues(first: 40) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldNumberValue {
                      number
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                  }
                }
                content {
                  __typename
                  ... on Issue {
                    number
                    title
                    body
                    milestone { title }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const itemsUserQuery = `
      query($login: String!, $n: Int!, $first: Int!, $after: String) {
        user(login: $login) {
          projectV2(number: $n) {
            items(first: $first, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                fieldValues(first: 40) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldNumberValue {
                      number
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                  }
                }
                content {
                  __typename
                  ... on Issue {
                    number
                    title
                    body
                    milestone { title }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const q = ctx.projectOwnerType === "organization"
      ? itemsQuery
      : itemsUserQuery;
    const out: Task[] = [];
    let cursor: string | undefined;
    let hasNext = true;

    while (hasNext) {
      const data = (await this.gql(q, {
        login,
        n: this.cfg.projectNumber,
        first: 100,
        after: cursor ?? null,
      })) as Record<string, unknown>;
      const root = ctx.projectOwnerType === "organization"
        ? data.organization
        : data.user;
      const proj = (root as Record<string, unknown> | undefined)?.projectV2 as
        | Record<string, unknown>
        | undefined;
      const items = proj?.items as
        | {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: unknown[];
        }
        | undefined;
      const nodes = items?.nodes ?? [];
      for (const raw of nodes) {
        const node = raw as Record<string, unknown>;
        const content = node.content as Record<string, unknown> | undefined;
        if (!content || content.__typename !== "Issue") {
          continue;
        }
        const issue = content as {
          __typename: string;
          number: number;
          title: string;
          body?: string | null;
          milestone?: { title?: string | null } | null;
        };
        const fv = (node.fieldValues as { nodes?: unknown[] } | undefined)?.nodes ??
          [];
        const task = this.mapIssueToTask(issue, fv, ctx);
        if (filter?.status && task.status !== filter.status) {
          continue;
        }
        if (filter?.epic !== undefined && task.epic !== filter.epic) {
          continue;
        }
        out.push(task);
      }
      hasNext = items?.pageInfo?.hasNextPage === true;
      cursor = items?.pageInfo?.endCursor ?? undefined;
      if (!hasNext) {
        break;
      }
    }

    out.sort((a, b) => a.priority - b.priority || Number(a.id) - Number(b.id));
    return out;
  }

  async getTask(id: string): Promise<Task | undefined> {
    const num = Number.parseInt(id.trim(), 10);
    if (!Number.isFinite(num) || num <= 0) {
      return undefined;
    }
    const ctx = await this.project();
    const { owner, name } = splitRepo(this.cfg.repository);
    const q = `
      query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          issue(number: $number) {
            number
            title
            body
            milestone { title }
            projectItems(first: 20) {
              nodes {
                id
                project { id }
                fieldValues(first: 40) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldNumberValue {
                      number
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const data = (await this.gql(q, { owner, name, number: num })) as {
      repository?: {
        issue?: {
          number: number;
          title: string;
          body?: string | null;
          milestone?: { title?: string | null } | null;
          projectItems?: {
            nodes?: Array<{
              id: string;
              project?: { id?: string };
              fieldValues?: { nodes?: unknown[] };
            }>;
          };
        } | null;
      } | null;
    };
    const issue = data.repository?.issue;
    if (!issue) {
      return undefined;
    }
    const pin = issue.projectItems?.nodes?.find(
      (n) => n.project?.id === ctx.projectId,
    );
    if (!pin) {
      return undefined;
    }
    const fv = pin.fieldValues?.nodes ?? [];
    return this.mapIssueToTask(issue, fv, ctx);
  }

  private async loadIssueUpdateContext(
    ctx: ProjectContext,
    issueNumber: number,
  ): Promise<IssueUpdateContext | null> {
    const { owner, name } = splitRepo(this.cfg.repository);
    const q = `
      query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          issue(number: $number) {
            id
            body
            projectItems(first: 20) {
              nodes {
                id
                project { id }
              }
            }
          }
        }
      }
    `;
    const data = (await this.gql(q, {
      owner,
      name,
      number: issueNumber,
    })) as {
      repository?: {
        issue?: {
          id?: string;
          body?: string | null;
          projectItems?: {
            nodes?: Array<{ id?: string; project?: { id?: string } }>;
          };
        } | null;
      } | null;
    };
    const issue = data.repository?.issue;
    if (!issue?.id) {
      return null;
    }
    const pin = issue.projectItems?.nodes?.find(
      (n) => n.project?.id === ctx.projectId,
    );
    const itemId = pin?.id;
    if (!itemId) {
      return null;
    }
    return {
      issueId: issue.id,
      body: issue.body ?? "",
      itemId,
    };
  }

  private async updateIssueBody(issueId: string, body: string): Promise<void> {
    const mutation = `
      mutation($input: UpdateIssueInput!) {
        updateIssue(input: $input) {
          issue { id }
        }
      }
    `;
    await this.gql(mutation, {
      input: {
        id: issueId,
        body,
      },
    });
  }

  private async addIssueComment(issueId: string, body: string): Promise<void> {
    const mutation = `
      mutation($input: AddCommentInput!) {
        addComment(input: $input) {
          commentEdge { node { id } }
        }
      }
    `;
    await this.gql(mutation, {
      input: {
        subjectId: issueId,
        body,
      },
    });
  }

  async updateTaskStatus(
    id: string,
    status: TaskStatus,
    transition?: TaskStatusTransition,
  ): Promise<void> {
    const ctx = await this.project();
    const num = Number.parseInt(id.trim(), 10);
    if (!Number.isFinite(num) || num <= 0) {
      throw new GitHubBacklogError(`Invalid issue id: ${id}`);
    }

    const load = await this.loadIssueUpdateContext(ctx, num);
    if (!load) {
      throw new GitHubBacklogError(
        `Issue #${id} is not in the configured Project.`,
      );
    }

    const checklist = transition?.workflowChecklist;
    let nextBody = load.body;

    if (checklist?.length) {
      const parsed = parseAcceptanceCriteriaSection(load.body);
      if (!parsed) {
        throw new GitHubBacklogError(
          'Issue body has no "## Acceptance Criteria" section; cannot reconcile workflow checklist.',
        );
      }
      if (status === "Complete") {
        for (const item of checklist) {
          if (!item.checked) {
            throw new GitHubBacklogError(
              "Cannot complete task with unchecked workflow checklist items in the transition payload.",
            );
          }
        }
      }
      const reconciled = reconcileAcceptanceCriteriaSectionLines(
        parsed.sectionLines,
        checklist,
      );
      if (status === "Complete") {
        verifyAllWorkflowTargetsChecked(reconciled, checklist);
      }
      nextBody = rebuildBodyWithAcceptanceSection(
        parsed.prefix,
        reconciled,
        parsed.suffix,
      );
    }

    if (nextBody !== load.body) {
      await this.updateIssueBody(load.issueId, nextBody);
    }

    const note = transition?.comment?.trim();
    if (note) {
      await this.addIssueComment(load.issueId, note);
    }

    const optionId = requireSingleSelectOptionId(ctx.status, status);
    const mutation = `
      mutation($input: UpdateProjectV2ItemFieldValueInput!) {
        updateProjectV2ItemFieldValue(input: $input) {
          projectV2Item { id }
        }
      }
    `;
    await this.gql(mutation, {
      input: {
        projectId: ctx.projectId,
        itemId: load.itemId,
        fieldId: ctx.status.id,
        value: { singleSelectOptionId: optionId },
      },
    });
  }

  async createTask(task: NewTask): Promise<Task> {
    const ctx = await this.project();
    const repoId = await this.repositoryNodeId();
    const { owner, name } = splitRepo(this.cfg.repository);

    let milestoneId: string | null = null;
    const epic = task.epic.trim();
    if (epic.length > 0) {
      const mq = `
        query($owner: String!, $name: String!, $first: Int!) {
          repository(owner: $owner, name: $name) {
            milestones(first: $first) {
              nodes { id title }
            }
          }
        }
      `;
      const mdata = (await this.gql(mq, { owner, name, first: 100 })) as {
        repository?: {
          milestones?: { nodes?: Array<{ id?: string; title?: string }> };
        } | null;
      };
      const milestones = mdata.repository?.milestones?.nodes ?? [];
      const hit = milestones.find((m) => (m.title ?? "").trim() === epic);
      if (!hit?.id) {
        throw new GitHubBacklogError(
          `Unresolved milestone for epic "${epic}": create or rename a milestone in ${this.cfg.repository} to match this title, or clear the epic.`,
        );
      }
      milestoneId = hit.id;
    }

    const title = task.description.trim();
    if (!title.length) {
      throw new GitHubBacklogError("Task description (issue title) is required.");
    }

    const bodyParts: string[] = [];
    if (task.acceptanceCriteria.trim().length) {
      bodyParts.push("## Acceptance Criteria\n\n" + task.acceptanceCriteria.trim());
    }
    if (task.prototype.trim().length) {
      bodyParts.push("## Prototype\n\n" + task.prototype.trim());
    }
    if (task.notes.trim().length) {
      bodyParts.push("## Notes\n\n" + task.notes.trim());
    }
    const body = bodyParts.join("\n\n");

    const createMutation = `
      mutation($input: CreateIssueInput!) {
        createIssue(input: $input) {
          issue {
            id
            number
            title
            body
            milestone { title }
          }
        }
      }
    `;
    const createData = (await this.gql(createMutation, {
      input: {
        repositoryId: repoId,
        title,
        body: body.length ? body : undefined,
        milestoneId: milestoneId ?? undefined,
      },
    })) as {
      createIssue?: {
        issue?: {
          id: string;
          number: number;
          title: string;
          body?: string | null;
          milestone?: { title?: string | null } | null;
        } | null;
      } | null;
    };
    const created = createData.createIssue?.issue;
    if (!created?.id) {
      throw new GitHubBacklogError("GitHub did not return the created issue.");
    }

    const addMutation = `
      mutation($input: AddProjectV2ItemByIdInput!) {
        addProjectV2ItemById(input: $input) {
          item {
            id
          }
        }
      }
    `;
    const addData = (await this.gql(addMutation, {
      input: {
        projectId: ctx.projectId,
        contentId: created.id,
      },
    })) as {
      addProjectV2ItemById?: { item?: { id?: string } | null } | null;
    };
    const itemId = addData.addProjectV2ItemById?.item?.id;
    if (!itemId) {
      throw new GitHubBacklogError("Failed to add the new issue to the GitHub Project.");
    }

    const updateMutation = `
      mutation($input: UpdateProjectV2ItemFieldValueInput!) {
        updateProjectV2ItemFieldValue(input: $input) {
          projectV2Item { id }
        }
      }
    `;

    await this.gql(updateMutation, {
      input: {
        projectId: ctx.projectId,
        itemId,
        fieldId: ctx.priority.id,
        value: { number: task.priority },
      },
    });

    const statusOptionId = requireSingleSelectOptionId(ctx.status, task.status);
    await this.gql(updateMutation, {
      input: {
        projectId: ctx.projectId,
        itemId,
        fieldId: ctx.status.id,
        value: { singleSelectOptionId: statusOptionId },
      },
    });

    const sizeValue = task.size.trim();
    if (sizeValue.length) {
      const sizeOptionId = requireSingleSelectOptionId(ctx.size, sizeValue);
      await this.gql(updateMutation, {
        input: {
          projectId: ctx.projectId,
          itemId,
          fieldId: ctx.size.id,
          value: { singleSelectOptionId: sizeOptionId },
        },
      });
    }

    return this.mapIssueToTask(
      {
        number: created.number,
        title: created.title,
        body: created.body,
        milestone: created.milestone,
      },
      [
        { number: task.priority, field: { name: ctx.priority.name } },
        { name: task.status, field: { name: ctx.status.name } },
        ...(sizeValue.length
          ? [{ name: sizeValue, field: { name: ctx.size.name } }]
          : []),
      ],
      ctx,
    );
  }
}
