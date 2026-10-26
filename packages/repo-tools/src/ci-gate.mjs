// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Uncached GitHub Actions aggregation command.
import assert from "node:assert/strict";

/** A skipped matrix is permitted only when the change plan makes it unnecessary. */
export function checkSupportResults(needs, extended = false) {
  assert.equal(needs.plan?.result, "success", "CI planning must pass");
  const profile = needs.plan.outputs?.profile;
  assert(["docs", "package", "full"].includes(profile), "Invalid CI profile");
  const required = ["compatibility", "declarations"];
  if (extended)
    required.push("typescript-versions", "intermediate-types", "upstream");
  for (const name of required)
    if (profile === "full" || extended)
      assert.equal(needs[name]?.result, "success", `${name} must pass`);
  for (const [name, job] of Object.entries(needs)) {
    if (["preview", "canary"].includes(name)) continue;
    assert(
      ["success", "skipped"].includes(job.result),
      `${name}: ${job.result}`,
    );
  }
}

export function main() {
  checkSupportResults(
    JSON.parse(process.env.CI_NEEDS),
    process.env.CI_EXTENDED === "true",
  );
  console.log("Required support checks passed; previews are informational.");
}
