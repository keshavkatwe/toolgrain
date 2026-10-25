import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runChangesetsNpm } from "../src/changesets-npm.mjs";

test("the npm boundary refuses workspace publication and propagates npm errors outside the checkout", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "toolgrain-npm-adapter-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.throws(() => runChangesetsNpm(["install"]), /Unsupported/);
  assert.throws(
    () => runChangesetsNpm(["info", "@toolgrain/mcp"], { env: {} }),
    /pinned npm/,
  );
  const cli = join(directory, "fake.cjs");
  writeFileSync(
    cli,
    `require('node:fs').writeFileSync(process.env.TOOLGRAIN_TEST_OUTPUT, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), oidc: process.env.ACTIONS_ID_TOKEN_REQUEST_URL })); process.stdout.write('{"error":{"code":"E403"}}'); process.exit(7);`,
  );
  const output = join(directory, "output.json");
  const options = {
    cwd: directory,
    env: {
      ...process.env,
      TOOLGRAIN_NPM_CLI: cli,
      TOOLGRAIN_TEST_OUTPUT: output,
      ACTIONS_ID_TOKEN_REQUEST_URL: "preserved",
    },
  };
  assert.throws(
    () => runChangesetsNpm(["publish", ".", "--json"], options),
    /packed archive/,
  );
  const result = runChangesetsNpm(
    ["publish", "./reviewed.tgz", "--tag", "latest"],
    options,
  );
  assert.equal(result.status, 7);
  assert.equal(JSON.parse(result.stdout).error.code, "E403");
  const recorded = JSON.parse(readFileSync(output));
  assert.notEqual(recorded.cwd, directory);
  assert.equal(recorded.oidc, "preserved");
  assert.deepEqual(recorded.args, [
    "publish",
    join(directory, "reviewed.tgz"),
    "--tag",
    "latest",
    "--ignore-scripts",
  ]);
});
