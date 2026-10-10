import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  sourcemap: true,
  // Les packages internes sont en TypeScript : on les embarque dans le bundle.
  noExternal: [/^@center\//],
});
