import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeGitHubMcpServer } from "./github-mcp-store.js";

describe("github-mcp-store", () => {
  it("writes a managed github MCP server", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-mcp-write-"));

    try {
      const result = writeGitHubMcpServer({
        cwd,
        serverName: "github",
        token: "ghp_secret",
      });

      expect(result.created).toBe(true);
      expect(result.serverKey).toBe("cursor-workflow:github");
      expect(
        JSON.parse(readFileSync(path.join(cwd, ".cursor", "mcp.json"), "utf8")),
      ).toEqual({
        mcpServers: {
          "cursor-workflow:github": {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_secret",
            },
          },
        },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("preserves non-managed MCP servers while replacing managed github server", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "byrde-mcp-merge-"));

    try {
      mkdirSync(path.join(cwd, ".cursor"), { recursive: true });
      writeFileSync(
        path.join(cwd, ".cursor", "mcp.json"),
        `${JSON.stringify({
          mcpServers: {
            "user-server": {
              command: "echo",
              args: ["hi"],
            },
            "cursor-workflow:github": {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-github"],
              env: {
                GITHUB_PERSONAL_ACCESS_TOKEN: "old",
              },
            },
          },
        }, null, 2)}\n`,
        "utf8",
      );

      writeGitHubMcpServer({
        cwd,
        serverName: "github",
        token: "new",
      });

      expect(
        JSON.parse(readFileSync(path.join(cwd, ".cursor", "mcp.json"), "utf8")),
      ).toEqual({
        mcpServers: {
          "user-server": {
            command: "echo",
            args: ["hi"],
          },
          "cursor-workflow:github": {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_PERSONAL_ACCESS_TOKEN: "new",
            },
          },
        },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
