import { copyFile, mkdir } from "node:fs/promises";

for (const path of ["vendor/2026-07-28", "vendor/2025-06-18"]) {
  await mkdir(`dist/${path}`, { recursive: true });
  for (const name of ["LICENSE", "provenance.json", "schema.ts"]) {
    await copyFile(`src/${path}/${name}`, `dist/${path}/${name}`);
  }
}
