const dependencyKinds = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
];
export const severities = ["info", "low", "moderate", "high", "critical"];

// Bun's text lockfile uses hoisted keys such as "express/cookie".
function resolveKey(packages, name, parent) {
  let scope = parent;
  while (scope) {
    const key = `${scope}/${name}`;
    if (Object.hasOwn(packages, key)) return key;
    scope = scope.replace(/(?:^|\/)(?:@[^/]+\/)?[^/]+$/, "");
  }
  if (Object.hasOwn(packages, name)) return name;
}

export function dependencyGraph(lock, workspace, includeDev = false) {
  const visited = new Set();
  const versions = new Map();
  function visit(manifest, parent, kinds) {
    for (const kind of kinds) {
      for (const name of Object.keys(manifest[kind] ?? {})) {
        const key = resolveKey(lock.packages, name, parent);
        if (!key) {
          if (
            kind === "optionalDependencies" ||
            (kind === "peerDependencies" &&
              (manifest.peerDependenciesMeta?.[name]?.optional ||
                manifest.optionalPeers?.includes(name)))
          )
            continue;
          throw new Error(
            `Unresolved locked dependency: ${parent || workspace || "root"} -> ${name}`,
          );
        }
        if (visited.has(key)) continue;
        visited.add(key);
        const [identity, , metadata] = lock.packages[key];
        const separator = identity.lastIndexOf("@");
        const actualName = identity.slice(0, separator);
        const version = identity.slice(separator + 1);
        if (version.startsWith("workspace:")) {
          const target = version.slice("workspace:".length);
          if (!lock.workspaces[target])
            throw new Error(`Missing workspace: ${target}`);
          visit(lock.workspaces[target], key, dependencyKinds);
        } else {
          if (!/^\d+\.\d+\.\d+/.test(version))
            throw new Error(`Unsupported locked version: ${identity}`);
          if (!versions.has(actualName)) versions.set(actualName, new Set());
          versions.get(actualName).add(version);
          visit(metadata ?? {}, key, dependencyKinds);
        }
      }
    }
  }
  if (!lock.workspaces[workspace])
    throw new Error(`Missing workspace: ${workspace}`);
  visit(
    lock.workspaces[workspace],
    lock.workspaces[workspace].name,
    includeDev ? [...dependencyKinds, "devDependencies"] : dependencyKinds,
  );
  return versions;
}

export function validateAdvisories(value) {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new Error("Invalid advisory response");
  for (const [name, advisories] of Object.entries(value)) {
    if (!Array.isArray(advisories) || advisories.length === 0)
      throw new Error(`Invalid advisories: ${name}`);
    for (const item of advisories) {
      if (
        !severities.includes(item.severity) ||
        typeof item.vulnerable_versions !== "string" ||
        !item.vulnerable_versions ||
        typeof item.title !== "string" ||
        typeof item.url !== "string" ||
        !Number.isSafeInteger(item.id)
      )
        throw new Error(`Invalid advisory: ${name}`);
    }
  }
  return value;
}

export function parseAudit(stdout, status) {
  if (![0, 1].includes(status))
    throw new Error(`Audit process failed (exit ${status})`);
  const advisories = validateAdvisories(JSON.parse(stdout));
  if (status === 1 && Object.keys(advisories).length === 0)
    throw new Error("Audit failed without advisories");
  return advisories;
}

export function auditFindings(graph, advisories, satisfies) {
  const findings = [];
  for (const [name, versions] of graph) {
    for (const advisory of advisories[name] ?? []) {
      const affectedVersions = [...versions].filter((version) =>
        satisfies(version, advisory.vulnerable_versions),
      );
      if (affectedVersions.length)
        findings.push({ name, versions: affectedVersions.sort(), ...advisory });
    }
  }
  return findings.sort(
    (a, b) =>
      severities.indexOf(b.severity) - severities.indexOf(a.severity) ||
      a.name.localeCompare(b.name) ||
      a.id - b.id,
  );
}
