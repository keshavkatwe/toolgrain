import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const name = process.argv[2];
const specifiers =
  name === "@toolgrain/protocol" ? [name, `${name}/2025-06-18`] : [name];
for (const specifier of specifiers) {
  const resolved = realpathSync(fileURLToPath(import.meta.resolve(specifier)));
  const path = relative(
    realpathSync(join(process.cwd(), "node_modules")),
    resolved,
  );
  assert(!isAbsolute(path) && !path.startsWith(`..${sep}`), resolved);
  assert(resolved.includes(`${sep}dist${sep}`), resolved);
  await import(specifier);
}
assert.throws(() => import.meta.resolve("@toolgrain/repo-tools"));
