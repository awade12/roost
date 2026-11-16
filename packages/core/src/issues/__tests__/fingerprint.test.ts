import { describe, expect, it } from "vitest";
import { culprit, fingerprint, normalize } from "../grouping/fingerprint.ts";

const jsCrash = (stack: string, message = "Cannot read properties of undefined (reading 'inventory')") => ({
  type: "TypeError",
  message,
  stack: `TypeError: ${message}\n${stack}`,
});

describe("fingerprint", () => {
  it("groups the same bug across builds even when line numbers move", () => {
    const a = jsCrash("    at ShopScreen (index.bundle?v=12:4021:31)\n    at render (index.bundle?v=12:88:2)");
    const b = jsCrash("    at ShopScreen (index.bundle?v=13:4100:7)\n    at render (index.bundle?v=13:90:4)");
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("separates different call sites with the same error type", () => {
    const a = jsCrash("    at ShopScreen (index.bundle:1:1)");
    const b = jsCrash("    at InventoryScreen (index.bundle:1:1)");
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("prefers in-app frames over engine frames", () => {
    const frames = (top: string) => [
      { function: top, file: "engine/core.rs", inApp: false },
      { function: "astar", file: "game/pathfind.rs", line: 88, inApp: true },
    ];
    const a = { type: "panic", message: "index out of bounds", stack: "", frames: frames("engine::tick") };
    const b = { type: "panic", message: "index out of bounds", stack: "", frames: frames("engine::update") };
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(culprit(a)).toBe("astar (pathfind.rs:88)");
  });

  it("falls back to the message (without numbers) when there's no stack", () => {
    const a = { type: "Error", message: "Asset 4821 failed to load", stack: "" };
    const b = { type: "Error", message: "Asset 977 failed to load", stack: "" };
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
});

describe("normalize", () => {
  it("strips addresses, ids and line numbers", () => {
    expect(normalize("at 0x7ffe12ab foo:12:4 id=deadbeefcafe")).toBe("at <addr> foo id=<id>");
  });
});
