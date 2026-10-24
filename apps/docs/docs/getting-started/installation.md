# Installation and requirements

## Current availability

Toolgrain packages are not published yet. To run the current implementation, clone the repository and use its workspace examples:

```bash
git clone https://github.com/keshavkatwe/toolgrain.git
cd toolgrain
bun install --frozen-lockfile
bun run build
```

Repository development uses Bun **1.3.14**. This is distinct from supported application execution: Bun applications require **1.4.4 or later within 1.x** because older versions do not provide the HTTP disconnect behavior Toolgrain needs. Supported Node applications use **^24.20.0**. See the [support policy](../project/support-policy.md) for the full matrix and evidence requirements.

## Intended consumer dependencies

After publication, a stdio or standalone Node HTTP application will install:

```bash
npm install @toolgrain/mcp @toolgrain/node zod
```

These commands describe future npm dependencies; they are not a claim that the packages are available today. A Web-based framework application uses `@toolgrain/http` in place of, or alongside, Node adapters. Add `@toolgrain/jwt` or `@toolgrain/clerk` when protecting HTTP endpoints.

Zod 4 is required. Both Classic and Mini user schemas are accepted through Zod's core contract. Toolgrain's minimum supported TypeScript compiler is **5.5.4**, with strict mode enabled.

## ESM and TypeScript

Toolgrain exports compiled ESM and declarations. CommonJS and Node's old `node10` resolution mode are unsupported. For a compiled Node application, a suitable starting point is:

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": false
  },
  "include": ["src/**/*.ts"]
}
```

Set `"type": "module"` in the application manifest and use `.js` extensions for relative imports in TypeScript intended for Node. Compile with `tsc`, then run the emitted entry point with Node. Frameworks may own compilation and use their own supported module resolution.

MCP packages include source and declaration maps for debugging; public exports still point to compiled `dist` files. Continue with [your first tool](stdio.md).
