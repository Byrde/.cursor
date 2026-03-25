import { describe, expect, it } from "vitest";
import {
  AGENT_MODEL_PLACEHOLDER,
  renderAgentTemplate,
} from "./agent-template.js";

describe("renderAgentTemplate", () => {
  it("substitutes the model placeholder", () => {
    expect(
      renderAgentTemplate(`---\nmodel: ${AGENT_MODEL_PLACEHOLDER}\n---\n`, "m-1"),
    ).toBe("---\nmodel: m-1\n---\n");
  });

  it("throws when the placeholder is missing", () => {
    expect(() => renderAgentTemplate("no token", "x")).toThrow(
      /missing.*placeholder/,
    );
  });
});
