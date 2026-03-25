import { execFile, execFileSync } from "node:child_process";

export interface GitHubAccount {
  readonly account: string;
  readonly host: string;
  readonly active: boolean;
}

function execFileResult(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(command, args, (error, stdout, stderr) => {
      const exitCode =
        error && typeof error === "object" && "code" in error
          ? (error.code as number)
          : error
            ? 1
            : 0;
      resolve({
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
        exitCode,
      });
    });
  });
}

/**
 * Parses `gh auth status` output into logged-in accounts (see agent-toolkit auth-checker).
 * Handles current `gh` output where each account block includes `- Active account: true|false`.
 */
export function parseGitHubAccounts(output: string): GitHubAccount[] {
  const accounts: GitHubAccount[] = [];
  const lines = output.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const accountMatch = line.match(/Logged in to (\S+) account (\S+)/);
    if (!accountMatch) {
      continue;
    }

    const host = accountMatch[1];
    const account = accountMatch[2];
    let active = line.includes("✓");

    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const next = lines[j];
      if (/Logged in to \S+ account \S+/.test(next)) {
        break;
      }
      if (/Active account:\s*true\b/.test(next)) {
        active = true;
        break;
      }
      if (/Active account:\s*false\b/.test(next)) {
        active = false;
        break;
      }
    }

    accounts.push({ host, account, active });
  }

  return accounts;
}

export async function listGitHubAccounts(): Promise<GitHubAccount[]> {
  let result: { stdout: string; stderr: string; exitCode: number };
  try {
    result = await execFileResult("gh", ["auth", "status"]);
  } catch {
    return [];
  }

  if (result.exitCode !== 0) {
    return [];
  }

  const combined = `${result.stdout}\n${result.stderr}`;
  return parseGitHubAccounts(combined);
}

/**
 * Resolves a token via `gh auth token`, optionally for a specific `--user` account.
 */
export async function resolveGitHubTokenForAccount(
  account?: string,
): Promise<string | undefined> {
  const args = ["auth", "token"];
  if (account) {
    args.push("--user", account);
  }

  try {
    const result = await execFileResult("gh", args);
    const token = result.stdout.trim();
    if (result.exitCode !== 0 || !token) {
      return undefined;
    }
    return token;
  } catch {
    return undefined;
  }
}

export function detectGitHubToken(): string | undefined {
  const envToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  try {
    const token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}
