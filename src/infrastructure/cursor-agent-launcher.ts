import { spawn } from "node:child_process";
import path from "node:path";

export interface LaunchCursorAgentResult {
  readonly exitCode: number | null;
  readonly errorMessage?: string;
}

const INIT_AGENT_MODEL = "claude-4.6-opus-high";

/**
 * Runs Cursor's `agent` CLI in the foreground with inherited stdio so the user
 * can complete the interactive initialization session in the same terminal.
 * Uses `--workspace`, `--model`, `--yolo`, and a positional initial prompt.
 * `--trust` is not passed: Cursor only allows it with `--print`/headless mode
 * (see CLI reference).
 * @see https://cursor.com/docs/cli/reference/parameters
 */
export async function launchCursorAgentSession(
  workspaceCwd: string,
  initialPrompt: string,
): Promise<LaunchCursorAgentResult> {
  const abs = path.resolve(workspaceCwd);
  const args = ["--workspace", abs, "--model", INIT_AGENT_MODEL, "--yolo", initialPrompt];
  return new Promise((resolve) => {
    const child = spawn("agent", args, {
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      resolve({
        exitCode: null,
        errorMessage:
          err.code === "ENOENT"
            ? "Could not find the `agent` command on PATH. Install Cursor Agent CLI or open `.cursor/prompts/project-initialization.md` or `.cursor/prompts/project-migration.md` and paste the prompt in Cursor manually."
            : err.message,
      });
    });
    child.on("exit", (code) => {
      resolve({ exitCode: code });
    });
  });
}
