import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import path from "node:path";
import { launchCursorAgentSession } from "./cursor-agent-launcher.js";

describe("launchCursorAgentSession", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("spawns agent with --workspace, --model, --yolo, and positional prompt", async () => {
    const mockChild = new EventEmitter() as import("node:child_process").ChildProcess;
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => mockChild.emit("exit", 0));
      return mockChild;
    });

    const cwd = path.join("some", "rel", "dir");
    const prompt = "init prompt body";
    const result = await launchCursorAgentSession(cwd, prompt);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const passedArgs = spawnMock.mock.calls[0]![1] as string[];
    expect(passedArgs).not.toContain("--trust");
    expect(passedArgs).toContain("--model");
    expect(passedArgs).toContain("claude-4.6-opus-high");
    expect(passedArgs).toContain("--yolo");
    expect(spawnMock).toHaveBeenCalledWith(
      "agent",
      ["--workspace", path.resolve(cwd), "--model", "claude-4.6-opus-high", "--yolo", prompt],
      expect.objectContaining({ stdio: "inherit", shell: false }),
    );
    expect(result).toEqual({ exitCode: 0 });
  });
});
