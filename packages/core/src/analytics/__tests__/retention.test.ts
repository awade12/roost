import { describe, expect, it } from "vitest";
import { averageRetention, type Cohort } from "../retention.ts";

describe("average retention", () => {
  it("weights by cohort size and skips cohorts that haven't reached a day", () => {
    const cohorts: Cohort[] = [
      { day: "2026-11-01", size: 100, retained: { 0: 100, 1: 40, 7: 10 } },
      { day: "2026-11-14", size: 50, retained: { 0: 50, 1: 10 } },
    ];
    const avg = averageRetention(cohorts);
    expect(avg[0]).toBe(1);
    expect(avg[1]).toBeCloseTo(50 / 150);
    expect(avg[7]).toBe(0.1);
    expect(avg[30]).toBeNull();
  });
});
