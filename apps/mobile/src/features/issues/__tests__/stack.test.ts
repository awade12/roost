import { describe, expect, it } from "vitest";
import { relativeSeconds, stackLines } from "../detail/stack.ts";

describe("stackLines", () => {
  it("drops the header line and blank lines", () => {
    const stack = "TypeError: boom\n    at load (save.ts:88)\n\n    at resume (loop.ts:212)\n";
    expect(stackLines(stack, "TypeError")).toEqual(["at load (save.ts:88)", "at resume (loop.ts:212)"]);
  });

  it("keeps a first line that isn't the header", () => {
    expect(stackLines("at a (x.ts:1)", "TypeError")).toEqual(["at a (x.ts:1)"]);
  });
});

describe("relativeSeconds", () => {
  const crash = "2026-11-18T12:00:10.000Z";
  it("counts back from the crash", () => {
    expect(relativeSeconds("2026-11-18T12:00:05.800Z", crash)).toBe("−4.2s");
    expect(relativeSeconds(crash, crash)).toBe("0.0s");
    expect(relativeSeconds("2026-11-18T11:58:10.000Z", crash)).toBe("−2m");
    expect(relativeSeconds("2026-11-18T07:00:10.000Z", crash)).toBe("−5h");
  });
});
