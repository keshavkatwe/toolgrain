import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

/** Serve unchanged packed libraries through npm's normal version/dependency resolver. */
export async function startArchiveRegistry(packages) {
  const entries = packages.map(({ manifest, archive }, index) => {
    const bytes = readFileSync(archive);
    return {
      manifest,
      bytes,
      path: `/archives/${index}.tgz`,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    };
  });
  let url;
  const server = createServer((request, response) => {
    let path;
    try {
      path = decodeURIComponent(new URL(request.url, url).pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    const entry = entries.find(
      ({ manifest, path: archivePath }) =>
        path === `/${manifest.name}` || path === archivePath,
    );
    if (!entry) {
      response
        .writeHead(404, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Unknown packed package" }));
      return;
    }
    const archive = path === entry.path;
    const body = archive
      ? entry.bytes
      : JSON.stringify({
          name: entry.manifest.name,
          "dist-tags": { latest: entry.manifest.version },
          versions: {
            [entry.manifest.version]: {
              ...entry.manifest,
              dist: {
                tarball: `${url}${entry.path}`,
                integrity: entry.integrity,
              },
            },
          },
        });
    response.writeHead(200, {
      "Content-Type": archive ? "application/octet-stream" : "application/json",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    async close() {
      // npm has exited before cleanup; close() also retires idle connections.
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
