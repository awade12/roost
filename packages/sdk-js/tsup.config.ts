import { defineConfig } from "tsup";

// The published package must stand alone: @roost/contracts is a workspace package nobody can
// install, so the few size limits the SDK uses (Zod-free, from @roost/contracts/limits) are
// bundled in, and the SDK's types are its own (src/wire). No dependencies at all.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2020",
  dts: true,
  noExternal: [/^@roost\//],
  clean: true,
  sourcemap: true,
});
