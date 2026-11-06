import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => ({
  plugins: [
    viteSingleFile(),
    {
      name: "verify-browser-boundary",
      generateBundle() {
        const modules = [...this.getModuleIds()];
        for (const id of modules) {
          if (
            /\/src\/(tools|server)\.ts$|@modelcontextprotocol|\bnode:/.test(id)
          )
            throw new Error(`Server dependency in widget: ${id}`);
        }
        this.emitFile({
          type: "asset",
          fileName: `${mode}-modules.json`,
          source: JSON.stringify(
            modules.map((id) => id.replace(process.cwd(), ".")),
          ),
        });
      },
    },
  ],
  build: {
    outDir: "dist/widgets",
    emptyOutDir: mode === "weather",
    rollupOptions: { input: `${mode}.html` },
  },
}));
