import { describe, expect, it } from "vitest";
import { lastDays, weekOverWeek } from "../days.ts";

describe("lastDays", () => {
  it("returns UTC days oldest first, ending today", () => {
    expect(lastDays(3, new Date("2026-03-01T05:00:00Z"))).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });
});

describe("weekOverWeek", () => {
  it("compares the last 7 values with the 7 before", () => {
    const values = [...Array(7).fill(100), ...Array(7).fill(110)];
    expect(weekOverWeek(values)).toEqual({ value: 110, change: expect.closeTo(0.1) });
  });

  it("has no change without a baseline", () => {
    expect(weekOverWeek([5, 5, 5])).toEqual({ value: 5, change: null });
  });
});
