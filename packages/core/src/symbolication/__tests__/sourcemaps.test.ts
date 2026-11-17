import { addMapping, GenMapping, toEncodedMap } from "@jridgewell/gen-mapping";
import { describe, expect, it } from "vitest";
import type { Crash } from "@roost/contracts";
import { applySourceMaps, parseJsStack } from "../sourcemaps.ts";

// main.js line 1: col 0 → src/save.ts:10:2 (loadSlot); col 10 → node_modules/lib/index.js:3:0.
function buildMap() {
  const gen = new GenMapping({ file: "main.js" });
  addMapping(gen, { generated: { line: 1, column: 0 }, source: "src/save.ts", original: { line: 10, column: 2 }, name: "loadSlot" });
  addMapping(gen, { generated: { line: 1, column: 10 }, source: "node_modules/lib/index.js", original: { line: 3, column: 0 } });
  return JSON.stringify(toEncodedMap(gen));
}
const MAP = buildMap();

const crash = (stack: string): Crash => ({
  id: "00000000-0000-4000-8000-000000000000",
  kind: "error",
  type: "TypeError",
  message: "x is undefined",
  stack,
  ts: new Date().toISOString(),
  sessionId: "s",
  playerId: "p",
  breadcrumbs: [],
  tags: {},
  contexts: {},
  extra: {},
  attachments: [],
});

describe("JS stacks", () => {
  it("parses V8, Hermes and Safari frames", () => {
    const frames = parseJsStack(
      ["TypeError: x", "    at loadSlot (https://game.test/main.js:1:1)", "    at https://game.test/main.js:1:11", "    at fn (address at index.android.bundle:1:9)", "save@https://game.test/main.js:1:1"].join("\n"),
    );
    expect(frames.map((f) => f.fn)).toEqual(["loadSlot", undefined, "fn", "save"]);
    expect(frames[2]).toMatchObject({ file: "index.android.bundle", line: 1, column: 9 });
  });

  it("maps frames to original sources and marks libraries as not in-app", () => {
    const out = applySourceMaps(crash("TypeError: x\n    at a (https://game.test/main.js?v=3:1:1)\n    at b (https://game.test/main.js:1:11)"), new Map([["main.js", MAP]]));
    expect(out.frames?.[0]).toMatchObject({ function: "loadSlot", file: "src/save.ts", line: 10, inApp: true });
    expect(out.frames?.[1]).toMatchObject({ file: "node_modules/lib/index.js", inApp: false });
    expect(out.stack).toContain("at loadSlot (src/save.ts:10:");
  });

  it("leaves a crash alone when no frame has a map", () => {
    const original = crash("TypeError: x\n    at a (https://game.test/other.js:1:1)");
    expect(applySourceMaps(original, new Map([["main.js", MAP]]))).toBe(original);
  });
});
