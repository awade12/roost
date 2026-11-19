import { defineConfig } from "vitest/config";

// Only plain-TypeScript modules are unit-tested here; screens are checked in the simulator.
export default defineConfig({ test: { include: ["src/**/__tests__/**/*.test.ts"] } });
