import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  minify: false,
  sourcemap: false,
  // CLI banner so the built file is executable directly.
  banner: { js: "#!/usr/bin/env node" },
});
