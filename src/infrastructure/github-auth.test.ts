import { describe, expect, it } from "vitest";
import { parseGitHubAccounts } from "./github-auth.js";

describe("parseGitHubAccounts", () => {
  it("parses one or more logged-in accounts from gh auth status output", () => {
    const sample = `
github.com
  ✓ Logged in to github.com account alice (keyring)
  - Active account: true
  - Git operations protocol: https

  ✓ Logged in to github.com account bob (keyring)
  - Active account: false
  - Git operations protocol: https
`;
    const accounts = parseGitHubAccounts(sample);
    expect(accounts).toEqual([
      { host: "github.com", account: "alice", active: true },
      { host: "github.com", account: "bob", active: false },
    ]);
  });

  it("returns an empty array when there are no account lines", () => {
    expect(parseGitHubAccounts("not logged in")).toEqual([]);
  });
});
