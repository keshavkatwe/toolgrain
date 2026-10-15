import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/vendor", { recursive: true });
for (const name of ["LICENSE", "provenance.json", "schema.ts"]) {
  await copyFile(`src/vendor/${name}`, `dist/vendor/${name}`);
}
