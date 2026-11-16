import { describe, expect, it } from "vitest";
import { signupPolicy } from "../auth-config.ts";

describe("signupPolicy", () => {
  it("matches exact addresses and whole domains", () => {
    const allowed = signupPolicy(" a@x.com, @studio.dev ");
    expect(allowed("a@x.com")).toBe(true);
    expect(allowed("b@x.com")).toBe(false);
    expect(allowed("anyone@studio.dev")).toBe(true);
    expect(allowed("anyone@notstudio.dev")).toBe(false);
  });

  it("is closed when empty and open with *", () => {
    expect(signupPolicy("")("a@x.com")).toBe(false);
    expect(signupPolicy("*")("a@x.com")).toBe(true);
  });
});
