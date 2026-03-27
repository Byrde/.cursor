import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Prefix for MCP server keys written and managed by this workflow (read-only detection). */
export const MANAGED_GITHUB_SERVER_PREFIX = "cursor-workflow:";

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

export interface ManagedGitHubMcpReadResult {
  readonly present: boolean;
  /** Keys under `mcpServers` that use the managed GitHub MCP prefix (no env/token values). */
  readonly serverKeys: readonly string[];
}

/**
 * Read-only signal: whether `.cursor/mcp.json` contains a workflow-managed GitHub MCP entry.
 * Does not validate tokens or server command lines beyond key naming.
 */
export function readManagedGitHubMcpSignal(cwd: string): ManagedGitHubMcpReadResult {
  const filePath = mcpConfigPath(cwd);
  if (!existsSync(filePath)) {
    return { present: false, serverKeys: [] };
  }
  const existing = readExistingConfig(cwd);
  const serverKeys = Object.keys(existing.mcpServers).filter((k) =>
    k.startsWith(MANAGED_GITHUB_SERVER_PREFIX),
  );
  return { present: serverKeys.length > 0, serverKeys };
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

/**
 * Removes only workflow-managed GitHub MCP server entries (keys with
 * {@link MANAGED_GITHUB_SERVER_PREFIX}). Preserves all other MCP servers.
 * Deletes `.cursor/mcp.json` when it would become empty.
 *
 * @returns true when the file was changed or removed.
 */
export function removeManagedGitHubMcpServers(cwd: string): boolean {
  const filePath = mcpConfigPath(cwd);
  if (!existsSync(filePath)) {
    return false;
  }
  const existing = readExistingConfig(cwd);
  const nextServers: Record<string, McpServerEntry> = {};
  for (const [key, value] of Object.entries(existing.mcpServers)) {
    if (!key.startsWith(MANAGED_GITHUB_SERVER_PREFIX)) {
      nextServers[key] = value;
    }
  }
  if (Object.keys(nextServers).length === Object.keys(existing.mcpServers).length) {
    return false;
  }
  if (Object.keys(nextServers).length === 0) {
    unlinkSync(filePath);
    return true;
  }
  writeFileSync(
    filePath,
    `${JSON.stringify({ mcpServers: nextServers }, null, 2)}\n`,
    "utf8",
  );
  return true;
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
