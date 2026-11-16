import { describe, expect, it } from "vitest";
import { placeholders, renderTemplate } from "../render.ts";

describe("renderTemplate", () => {
  it("fills placeholders, tolerating spaces inside the braces", () => {
    expect(renderTemplate("Hi {{ name }}, level {{level}}", { name: "Sam", level: 3 })).toEqual({ ok: true, text: "Hi Sam, level 3" });
  });

  it("lists every missing variable instead of sending a half-filled prompt", () => {
    expect(renderTemplate("{{a}} {{b}} {{a}}", {})).toEqual({ ok: false, missing: ["a", "b"] });
  });

  it("finds placeholders in order of first use", () => {
    expect(placeholders("{{b}} {{a}} {{b}}")).toEqual(["b", "a"]);
  });
});
