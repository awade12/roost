import { describe, expect, it } from "vitest";
import { chartPaths } from "../components/chart-paths.ts";

describe("chartPaths", () => {
  it("puts both series on one scale and ends at the last point", () => {
    const p = chartPaths([10, 20, 40], [5, 50, 10], 100, 50);
    expect(p.line.startsWith("M")).toBe(true);
    expect(p.previous).not.toBeNull();
    // The previous period's 50 is the max, so the current 40 sits below the top.
    expect(p.end.y).toBeGreaterThan(2);
    expect(p.end.x).toBeCloseTo(98, 0);
    expect(p.area.endsWith("Z")).toBe(true);
  });

  it("copes with no data", () => {
    const p = chartPaths([], [], 100, 50);
    expect(p.previous).toBeNull();
    expect(p.end).toEqual({ x: 98, y: 48 });
  });
});
