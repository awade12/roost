import { describe, expect, it } from "vitest";
import { projectMonth } from "../../features/ai/use-ai.ts";
import { propsLine } from "../../features/events/use-event-stream.ts";
import { formatAgo, parseTime } from "../format.ts";

describe("parseTime", () => {
  it("reads ClickHouse timestamps as UTC", () => {
    expect(parseTime("2026-11-18 09:41:00.123").toISOString()).toBe("2026-11-18T09:41:00.123Z");
    expect(parseTime("2026-11-18T09:41:00Z").toISOString()).toBe("2026-11-18T09:41:00.000Z");
  });

  it("lets formatAgo take either form", () => {
    const now = Date.parse("2026-11-18T09:46:00Z");
    expect(formatAgo("2026-11-18 09:41:00.000", now)).toBe("5m ago");
  });
});

describe("propsLine", () => {
  it("flattens props and adds a non-zero value", () => {
    expect(propsLine('{"level":3,"mode":"hard"}', 84)).toBe("level=3 mode=hard value=84");
    expect(propsLine("{}", 0)).toBe("");
    expect(propsLine("not json", null)).toBe("");
  });
});

describe("projectMonth", () => {
  it("projects the daily rate to the month's end", () => {
    expect(projectMonth(100, new Date(Date.UTC(2026, 10, 10)))).toBeCloseTo(300);
  });
});
