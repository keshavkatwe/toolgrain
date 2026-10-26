// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Uncached GitHub Actions planning command.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const library = "(?:protocol|mcp|http|node|jwt|clerk)";
const packageDocument = new RegExp(
  `^packages/${library}/(?:README\\.md|CHANGELOG\\.md|LICENSE|NOTICE)$`,
);
const packageManifest = new RegExp(`^packages/${library}/package\\.json$`);
const editorialFields = new Set(["description", "homepage", "keywords"]);

/** Only editorial manifest fields can bypass runtime and declaration checks. */
export function editorialManifest(before, after) {
  const contract = (manifest) =>
    Object.fromEntries(
      Object.entries(manifest).filter(([key]) => !editorialFields.has(key)),
    );
  return JSON.stringify(contract(before)) === JSON.stringify(contract(after));
}

/** Unknown files take the full path; renamed files must include both paths. */
export function classifyChanges(paths, manifestIsEditorial = () => false) {
  let profile = paths.length ? "docs" : "full";
  const docs = paths.some(
    (path) => path.startsWith("docs/") || path.startsWith("brand/"),
  );
  for (const path of paths) {
    if (
      packageDocument.test(path) ||
      (packageManifest.test(path) && manifestIsEditorial(path))
    ) {
      if (profile !== "full") profile = "package";
    } else if (
      !(
        /^[^/]+\.md$/.test(path) ||
        /^(?:LICENSE|NOTICE)$/.test(path) ||
        /^(?:docs|brand)\//.test(path) ||
        /^\.changeset\/[^/]+\.md$/.test(path) ||
        /^\.github\/(?:[^/]+\.md|ISSUE_TEMPLATE\/)/.test(path) ||
        /^(?:apps\/[^/]+|packages\/repo-tools)\/README\.md$/.test(path)
      )
    ) {
      profile = "full";
    }
  }
  return { profile, docs };
}

/** Missing history, initial pushes and explicit runs always retain full checks. */
export function planChecks({
  eventName,
  event,
  full = false,
  cwd = process.cwd(),
}) {
  const fallback = { profile: "full", docs: true };
  const base =
    eventName === "pull_request" ? event.pull_request?.base?.sha : event.before;
  const head =
    eventName === "pull_request" ? event.pull_request?.head?.sha : event.after;
  if (
    !["pull_request", "push"].includes(eventName) ||
    event.ref?.startsWith("refs/tags/") ||
    ![base, head].every(
      (sha) => /^[a-f0-9]{40}$/.test(sha ?? "") && !/^0+$/.test(sha),
    )
  )
    return fallback;
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });
  try {
    const from =
      eventName === "pull_request"
        ? git("merge-base", base, head).trim()
        : base;
    const paths = git(
      "diff",
      "--no-renames",
      "--name-only",
      "-z",
      from,
      head,
      "--",
    )
      .split("\0")
      .filter(Boolean);
    const plan = classifyChanges(paths, (path) => {
      try {
        return editorialManifest(
          JSON.parse(git("show", `${from}:${path}`)),
          JSON.parse(git("show", `${head}:${path}`)),
        );
      } catch {
        return false;
      }
    });
    return { ...plan, profile: full ? "full" : plan.profile };
  } catch {
    return fallback;
  }
}

export function main() {
  const event = process.env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
    : {};
  const plan = planChecks({
    eventName: process.env.GITHUB_EVENT_NAME,
    event,
    full: process.env.CI_FULL === "true",
  });
  console.log(`CI profile: ${plan.profile}; site checks: ${plan.docs}`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `profile=${plan.profile}\ndocs=${plan.docs}\n`,
    );
  return plan;
}
