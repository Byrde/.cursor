import { describe, expect, it } from "vitest";
import {
  createDefaultWorkflowModels,
  normalizeProjectConfig,
} from "../domain/config.js";
import {
  GitHubBacklogError,
  GitHubIssuesBacklogProvider,
  type GitHubGraphQlExecutor,
} from "./github-issues-backlog-provider.js";

function ghConfigBlock() {
  return normalizeProjectConfig({
    backlog: {
      provider: "github-issues",
      "github-issues": {
        repository: "acme/demo",
        projectNumber: 3,
        priorityField: "Priority",
        statusField: "Status",
        sizeField: "Size",
        mcpServerName: "github",
      },
    },
    workflow: {
      defaults: {
        preDevelopmentReview: "required",
        postDevelopmentReview: "optional",
        testing: "required",
      },
      models: createDefaultWorkflowModels(),
    },
  }).backlog["github-issues"]!;
}

describe("GitHubIssuesBacklogProvider", () => {
  it("fails clearly when the token is missing", async () => {
    const cfg = ghConfigBlock();
    const provider = new GitHubIssuesBacklogProvider(cfg, "");
    await expect(provider.listTasks()).rejects.toThrow(GitHubBacklogError);
    await expect(provider.listTasks()).rejects.toThrow(/authentication/);
  });

  it("maps project fields and reads size from single-select values", async () => {
    const fieldNodes = [
      {
        __typename: "ProjectV2NumberField",
        id: "F_PRIO",
        name: "Priority",
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_STAT",
        name: "Status",
        options: [
          { id: "st_todo", name: "TODO" },
          { id: "st_prog", name: "In Progress" },
        ],
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_SIZE",
        name: "Size",
        options: [
          { id: "sz_s", name: "S" },
          { id: "sz_m", name: "M" },
        ],
      },
    ];

    const itemNodes = [
      {
        id: "ITEM1",
        fieldValues: {
          nodes: [
            {
              __typename: "ProjectV2ItemFieldNumberValue",
              number: 10,
              field: { name: "Priority" },
            },
            {
              __typename: "ProjectV2ItemFieldSingleSelectValue",
              name: "TODO",
              field: { name: "Status" },
            },
            {
              __typename: "ProjectV2ItemFieldSingleSelectValue",
              name: "M",
              field: { name: "Size" },
            },
          ],
        },
        content: {
          __typename: "Issue",
          number: 42,
          title: "Hello",
          body: "crit",
          milestone: { title: "Epic A" },
        },
      },
    ];

    let call = 0;
    const gql: GitHubGraphQlExecutor = async (query) => {
      call += 1;
      if (query.includes("fields(first") && query.includes("projectV2(number")) {
        return {
          organization: {
            projectV2: {
              id: "P1",
              fields: { nodes: fieldNodes },
            },
          },
        };
      }
      if (query.includes("items(") && query.includes("projectV2(number")) {
        return {
          organization: {
            projectV2: {
              items: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: itemNodes,
              },
            },
          },
        };
      }
      throw new Error(`Unexpected query in mock (call ${String(call)})`);
    };

    const provider = new GitHubIssuesBacklogProvider(ghConfigBlock(), "tok", {
      graphQl: gql,
    });
    const tasks = await provider.listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "42",
      epic: "Epic A",
      priority: 10,
      size: "M",
      status: "TODO",
      description: "Hello",
      acceptanceCriteria: "crit",
    });
  });

  it("fails when a configured project field is absent", async () => {
    const gql: GitHubGraphQlExecutor = async (query) => {
      if (query.includes("fields(first") && query.includes("projectV2(number")) {
        return {
          organization: {
            projectV2: {
              id: "P1",
              fields: {
                nodes: [
                  {
                    __typename: "ProjectV2NumberField",
                    id: "F_PRIO",
                    name: "Priority",
                  },
                  {
                    __typename: "ProjectV2SingleSelectField",
                    id: "F_STAT",
                    name: "Status",
                    options: [{ id: "x", name: "TODO" }],
                  },
                ],
              },
            },
          },
        };
      }
      return {};
    };

    const provider = new GitHubIssuesBacklogProvider(ghConfigBlock(), "tok", {
      graphQl: gql,
    });
    await expect(provider.listTasks()).rejects.toThrow(/not found/);
  });

  it("writes size during createTask via updateProjectV2ItemFieldValue", async () => {
    const fieldNodes = [
      {
        __typename: "ProjectV2NumberField",
        id: "F_PRIO",
        name: "Priority",
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_STAT",
        name: "Status",
        options: [{ id: "st_todo", name: "TODO" }],
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_SIZE",
        name: "Size",
        options: [{ id: "sz_m", name: "M" }],
      },
    ];

    const updates: unknown[] = [];
    const gql: GitHubGraphQlExecutor = async (query, variables) => {
      if (query.includes("fields(first") && query.includes("projectV2(number")) {
        return {
          organization: {
            projectV2: {
              id: "P1",
              fields: { nodes: fieldNodes },
            },
          },
        };
      }
      if (query.includes("milestones(")) {
        return {
          repository: { milestones: { nodes: [] } },
        };
      }
      if (
        query.includes("repository(") &&
        query.includes("name: $name") &&
        !query.includes("milestones") &&
        !query.includes("issue(")
      ) {
        return { repository: { id: "R1" } };
      }
      if (query.includes("createIssue(")) {
        return {
          createIssue: {
            issue: {
              id: "ISSUE_NODE",
              number: 99,
              title: "New task",
              body: "",
              milestone: null,
            },
          },
        };
      }
      if (query.includes("addProjectV2ItemById")) {
        return {
          addProjectV2ItemById: {
            item: { id: "ITEM_NEW" },
          },
        };
      }
      if (query.includes("updateProjectV2ItemFieldValue")) {
        updates.push(variables);
        return { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM_NEW" } } };
      }
      throw new Error("unexpected");
    };

    const provider = new GitHubIssuesBacklogProvider(ghConfigBlock(), "tok", {
      graphQl: gql,
    });

    await provider.createTask({
      epic: "",
      priority: 100,
      size: "M",
      description: "New task",
      acceptanceCriteria: "",
      status: "TODO",
      prototype: "",
      notes: "",
    });

    const sizeUpdate = updates.find(
      (u) =>
        typeof u === "object" &&
        u !== null &&
        (u as { input?: { fieldId?: string } }).input?.fieldId === "F_SIZE",
    );
    expect(sizeUpdate).toBeDefined();
    expect(
      (sizeUpdate as { input: { value: { singleSelectOptionId: string } } }).input
        .value,
    ).toEqual({ singleSelectOptionId: "sz_m" });
  });

  it("fails createTask when epic does not match a repository milestone", async () => {
    const fieldNodes = [
      {
        __typename: "ProjectV2NumberField",
        id: "F_PRIO",
        name: "Priority",
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_STAT",
        name: "Status",
        options: [{ id: "st_todo", name: "TODO" }],
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_SIZE",
        name: "Size",
        options: [{ id: "sz_s", name: "S" }],
      },
    ];

    const gql: GitHubGraphQlExecutor = async (query) => {
      if (query.includes("fields(first") && query.includes("projectV2(number")) {
        return {
          organization: {
            projectV2: {
              id: "P1",
              fields: { nodes: fieldNodes },
            },
          },
        };
      }
      if (query.includes("milestones(")) {
        return {
          repository: {
            milestones: {
              nodes: [{ id: "M1", title: "Real Epic" }],
            },
          },
        };
      }
      if (
        query.includes("repository(") &&
        query.includes("name: $name") &&
        !query.includes("milestones") &&
        !query.includes("issue(")
      ) {
        return { repository: { id: "R1" } };
      }
      throw new Error("unexpected");
    };

    const provider = new GitHubIssuesBacklogProvider(ghConfigBlock(), "tok", {
      graphQl: gql,
    });

    await expect(
      provider.createTask({
        epic: "Missing Epic",
        priority: 100,
        size: "S",
        description: "x",
        acceptanceCriteria: "",
        status: "TODO",
        prototype: "",
        notes: "",
      }),
    ).rejects.toThrow(/Unresolved milestone/);
  });

  it("updateTaskStatus reconciles Acceptance Criteria checkboxes, comments, then Project status", async () => {
    const fieldNodes = [
      {
        __typename: "ProjectV2NumberField",
        id: "F_PRIO",
        name: "Priority",
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_STAT",
        name: "Status",
        options: [
          { id: "st_todo", name: "TODO" },
          { id: "st_comp", name: "Complete" },
        ],
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_SIZE",
        name: "Size",
        options: [{ id: "sz_s", name: "S" }],
      },
    ];

    const issueBody =
      "## Acceptance Criteria\n\n" +
      "- [ ] First task\n" +
      "- [ ] Second task\n\n" +
      "## Notes\n\n" +
      "Leave this alone.";

    const steps: string[] = [];
    const gql: GitHubGraphQlExecutor = async (query, variables) => {
      if (query.includes("fields(first") && query.includes("projectV2(number")) {
        return {
          organization: {
            projectV2: {
              id: "P1",
              fields: { nodes: fieldNodes },
            },
          },
        };
      }
      if (
        query.includes("repository(") &&
        query.includes("issue(number:") &&
        query.includes("projectItems")
      ) {
        return {
          repository: {
            issue: {
              id: "ISSUE_NODE",
              body: issueBody,
              projectItems: {
                nodes: [{ id: "ITEM1", project: { id: "P1" } }],
              },
            },
          },
        };
      }
      if (query.includes("updateIssue(")) {
        steps.push("updateIssue");
        const input = (variables as { input?: { body?: string } })?.input;
        expect(input?.body).toContain("- [x] First task");
        expect(input?.body).toContain("- [x] Second task");
        expect(input?.body).toContain("Leave this alone.");
        return { updateIssue: { issue: { id: "ISSUE_NODE" } } };
      }
      if (query.includes("addComment(")) {
        steps.push("addComment");
        expect(
          (variables as { input?: { body?: string } })?.input?.body,
        ).toBe("Done.");
        return { addComment: { commentEdge: { node: { id: "C1" } } } };
      }
      if (query.includes("updateProjectV2ItemFieldValue")) {
        steps.push("status");
        expect(
          (variables as { input?: { value?: { singleSelectOptionId?: string } } })
            ?.input?.value,
        ).toEqual({ singleSelectOptionId: "st_comp" });
        return { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM1" } } };
      }
      throw new Error("unexpected");
    };

    const provider = new GitHubIssuesBacklogProvider(ghConfigBlock(), "tok", {
      graphQl: gql,
    });

    await provider.updateTaskStatus("42", "Complete", {
      comment: "Done.",
      workflowChecklist: [
        { text: "First task", checked: true },
        { text: "Second task", checked: true },
      ],
    });

    expect(steps).toEqual(["updateIssue", "addComment", "status"]);
  });

  it("updateTaskStatus does not write Project status when Complete checklist cannot reconcile", async () => {
    const fieldNodes = [
      {
        __typename: "ProjectV2NumberField",
        id: "F_PRIO",
        name: "Priority",
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_STAT",
        name: "Status",
        options: [
          { id: "st_todo", name: "TODO" },
          { id: "st_comp", name: "Complete" },
        ],
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_SIZE",
        name: "Size",
        options: [{ id: "sz_s", name: "S" }],
      },
    ];

    const issueBody = "## Acceptance Criteria\n\n- [ ] Only one\n";

    let didStatus = false;
    const gql: GitHubGraphQlExecutor = async (query) => {
      if (query.includes("fields(first") && query.includes("projectV2(number")) {
        return {
          organization: {
            projectV2: {
              id: "P1",
              fields: { nodes: fieldNodes },
            },
          },
        };
      }
      if (
        query.includes("repository(") &&
        query.includes("issue(number:") &&
        query.includes("projectItems")
      ) {
        return {
          repository: {
            issue: {
              id: "ISSUE_NODE",
              body: issueBody,
              projectItems: {
                nodes: [{ id: "ITEM1", project: { id: "P1" } }],
              },
            },
          },
        };
      }
      if (query.includes("updateProjectV2ItemFieldValue")) {
        didStatus = true;
        return { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM1" } } };
      }
      throw new Error("unexpected");
    };

    const provider = new GitHubIssuesBacklogProvider(ghConfigBlock(), "tok", {
      graphQl: gql,
    });

    await expect(
      provider.updateTaskStatus("7", "Complete", {
        workflowChecklist: [
          { text: "Only one", checked: true },
          { text: "Missing second", checked: true },
        ],
      }),
    ).rejects.toThrow(/Could not find workflow checklist item/);

    expect(didStatus).toBe(false);
  });

  it("updateTaskStatus rejects Complete when transition marks a checklist item unchecked", async () => {
    const fieldNodes = [
      {
        __typename: "ProjectV2NumberField",
        id: "F_PRIO",
        name: "Priority",
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_STAT",
        name: "Status",
        options: [
          { id: "st_todo", name: "TODO" },
          { id: "st_comp", name: "Complete" },
        ],
      },
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_SIZE",
        name: "Size",
        options: [{ id: "sz_s", name: "S" }],
      },
    ];

    let didStatus = false;
    const gql: GitHubGraphQlExecutor = async (query) => {
      if (query.includes("fields(first") && query.includes("projectV2(number")) {
        return {
          organization: {
            projectV2: {
              id: "P1",
              fields: { nodes: fieldNodes },
            },
          },
        };
      }
      if (
        query.includes("repository(") &&
        query.includes("issue(number:") &&
        query.includes("projectItems")
      ) {
        return {
          repository: {
            issue: {
              id: "ISSUE_NODE",
              body: "## Acceptance Criteria\n\n- [ ] One\n",
              projectItems: {
                nodes: [{ id: "ITEM1", project: { id: "P1" } }],
              },
            },
          },
        };
      }
      if (query.includes("updateProjectV2ItemFieldValue")) {
        didStatus = true;
        return { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM1" } } };
      }
      throw new Error("unexpected");
    };

    const provider = new GitHubIssuesBacklogProvider(ghConfigBlock(), "tok", {
      graphQl: gql,
    });

    await expect(
      provider.updateTaskStatus("7", "Complete", {
        workflowChecklist: [{ text: "One", checked: false }],
      }),
    ).rejects.toThrow(/unchecked workflow checklist items/);

    expect(didStatus).toBe(false);
  });
});
