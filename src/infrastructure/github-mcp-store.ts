import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MANAGED_GITHUB_SERVER_PREFIX = "cursor-workflow:";

export interface McpServerEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface CursorMcpConfig {
  readonly mcpServers: Record<string, McpServerEntry>;
}

export interface GitHubMcpWriteParams {
  readonly cwd: string;
  readonly serverName: string;
  readonly token: string;
}

export interface GitHubMcpWriteResult {
  readonly path: string;
  readonly created: boolean;
  readonly serverKey: string;
}

function mcpConfigPath(cwd: string): string {
  return path.join(cwd, ".cursor", "mcp.json");
}

function readExistingConfig(cwd: string): CursorMcpConfig {
  const filePath = mcpConfigPath(cwd);
  if (!existsSync(filePath)) {
    return { mcpServers: {} };
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8")) as {
    mcpServers?: Record<string, McpServerEntry>;
  };
  return {
    mcpServers: raw.mcpServers ?? {},
  };
}

function managedServerKey(serverName: string): string {
  return `${MANAGED_GITHUB_SERVER_PREFIX}${serverName}`;
}

export function writeGitHubMcpServer(
  params: GitHubMcpWriteParams,
): GitHubMcpWriteResult {
  const filePath = mcpConfigPath(params.cwd);
  const created = !existsSync(filePath);
  const existing = readExistingConfig(params.cwd);
  const serverKey = managedServerKey(params.serverName);

  const nextServers: Record<string, McpServerEntry> = {};

  for (const [key, value] of Object.entries(existing.mcpServers)) {
    if (!key.startsWith(MANAGED_GITHUB_SERVER_PREFIX)) {
      nextServers[key] = value;
    }
  }

  nextServers[serverKey] = {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: params.token,
    },
  };

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify({ mcpServers: nextServers }, null, 2)}\n`,
    "utf8",
  );

  return {
    path: filePath,
    created,
    serverKey,
  };
}
