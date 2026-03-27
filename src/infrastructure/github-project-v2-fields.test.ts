import { describe, expect, it } from "vitest";
import {
  GitHubProjectFieldError,
  requireSingleSelectOptionId,
  resolveNamedProjectField,
} from "./github-project-v2-fields.js";

describe("resolveNamedProjectField", () => {
  it("resolves a number field by name", () => {
    const nodes = [
      {
        __typename: "ProjectV2NumberField",
        id: "F_P",
        name: "Priority",
      },
    ];
    const f = resolveNamedProjectField(nodes, "Priority", "number");
    expect(f).toEqual({
      id: "F_P",
      name: "Priority",
      kind: "number",
      options: [],
    });
  });

  it("resolves a single-select field by name", () => {
    const nodes = [
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_S",
        name: "Size",
        options: [
          { id: "opt_s", name: "S" },
          { id: "opt_m", name: "M" },
        ],
      },
    ];
    const f = resolveNamedProjectField(nodes, "Size", "singleSelect");
    expect(f.kind).toBe("singleSelect");
    expect(f.options).toHaveLength(2);
  });

  it("throws when the field is missing", () => {
    expect(() =>
      resolveNamedProjectField([], "Priority", "number")
    ).toThrow(GitHubProjectFieldError);
    expect(() =>
      resolveNamedProjectField([], "Priority", "number")
    ).toThrow(/not found/);
  });

  it("throws when the field has the wrong GraphQL typename", () => {
    const nodes = [
      {
        __typename: "ProjectV2SingleSelectField",
        id: "F_P",
        name: "Priority",
        options: [],
      },
    ];
    expect(() =>
      resolveNamedProjectField(nodes, "Priority", "number")
    ).toThrow(/Number field/);
  });
});

describe("requireSingleSelectOptionId", () => {
  it("returns the option id for an exact name match", () => {
    const field = {
      id: "F",
      name: "Size",
      kind: "singleSelect" as const,
      options: [{ id: "oid", name: "M" }],
    };
    expect(requireSingleSelectOptionId(field, "M")).toBe("oid");
  });

  it("throws when the option name is not configured on the field", () => {
    const field = {
      id: "F",
      name: "Size",
      kind: "singleSelect" as const,
      options: [{ id: "oid", name: "S" }],
    };
    expect(() => requireSingleSelectOptionId(field, "XL")).toThrow(
      /No "Size" option "XL"/,
    );
  });
});
