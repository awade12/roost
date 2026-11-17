import { describe, expect, it } from "vitest";
import { bucket, matchesType, resolveFlag, type FlagRow } from "../evaluate.ts";

const flag = (patch: Partial<FlagRow> = {}): FlagRow => ({ key: "new_shop", type: "boolean", value: false, rollout: null, overrides: {}, ...patch });

describe("flag evaluation", () => {
  it("serves the default when nothing targets the player", () => {
    expect(resolveFlag(flag(), "p1")).toEqual({ type: "boolean", value: false, variant: "default", reason: "STATIC" });
  });

  it("lets overrides win over rollouts", () => {
    const f = flag({ rollout: { percent: 100, value: true }, overrides: { p1: false } });
    expect(resolveFlag(f, "p1")).toMatchObject({ value: false, variant: "override", reason: "TARGETING_MATCH" });
    expect(resolveFlag(f, "p2")).toMatchObject({ value: true, variant: "rollout", reason: "SPLIT" });
  });

  it("rolls out to about the right share, and only adds players as the percent grows", () => {
    const players = Array.from({ length: 4000 }, (_, i) => `player-${i}`);
    const at = (percent: number) => new Set(players.filter((p) => resolveFlag(flag({ rollout: { percent, value: true } }), p).value === true));
    const ten = at(10);
    const twenty = at(20);
    expect(ten.size / players.length).toBeGreaterThan(0.08);
    expect(ten.size / players.length).toBeLessThan(0.12);
    expect([...ten].every((p) => twenty.has(p))).toBe(true);
    expect(bucket("a", "p1")).not.toBe(bucket("b", "p1"));
  });

  it("checks values against the flag type", () => {
    expect(matchesType("boolean", true)).toBe(true);
    expect(matchesType("number", "3")).toBe(false);
    expect(matchesType("number", Number.NaN)).toBe(false);
    expect(matchesType("json", { a: [1] })).toBe(true);
  });
});
