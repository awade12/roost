import { defineConfig } from "tsup";

// Bundle everything into one file so the Docker image needs no node_modules.
// The banner gives bundled CommonJS deps (pg, pino) a working `require`.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  splitting: false,
  noExternal: [/.*/],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
