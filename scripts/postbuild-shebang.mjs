import { readFileSync, writeFileSync } from "node:fs";

const shebang = "#!/usr/bin/env node\n";

for (const rel of ["dist/cli.js", "dist/sync-workflow.js"]) {
  const body = readFileSync(rel, "utf8");
  if (!body.startsWith("#!")) {
    writeFileSync(rel, shebang + body);
  }
}
