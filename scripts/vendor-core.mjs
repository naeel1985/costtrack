// Repack @cashflow/core into apps/web/vendor/cashflow-core.tgz.
//
// The web app depends on the engines via this tarball (a plain `file:` dep) so
// it installs as an ordinary standalone app on cPanel/CloudLinux, whose npm does
// not support workspaces. Run this whenever packages/core changes, then commit
// the updated tarball. Cross-platform (no shell `mv`).

import { execSync } from "node:child_process";
import { readdirSync, renameSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "vendor");
const coreDir = join(root, "packages", "core");

mkdirSync(dest, { recursive: true });
// Pack from inside packages/core (no workspace flags — the repo has no npm
// workspaces, since cPanel's npm can't handle a workspace ancestor).
execSync(`npm pack --pack-destination "${dest}"`, { cwd: coreDir, stdio: "inherit" });

for (const f of readdirSync(dest)) {
  if (/^cashflow-core-.*\.tgz$/.test(f)) renameSync(join(dest, f), join(dest, "cashflow-core.tgz"));
}
console.log("Vendored @cashflow/core -> apps/web/vendor/cashflow-core.tgz");
