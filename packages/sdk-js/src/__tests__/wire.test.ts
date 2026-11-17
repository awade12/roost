import type * as C from "@roost/contracts";
import { describe, expect, it } from "vitest";
import type * as W from "../wire/index.ts";

/** Compiles only if A and B are assignable both ways (same shape for the API and the SDK). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const same = <T extends true>(): T => true as T;

describe("SDK wire types match @roost/contracts", () => {
  it("compiles", () => {
    same<Same<W.EventContext, C.EventContext>>();
    same<Same<W.RoostEvent, C.RoostEvent>>();
    same<Same<W.Breadcrumb, C.Breadcrumb>>();
    same<Same<W.Crash, C.Crash>>();
    same<Same<W.PlayerReport, C.PlayerReport>>();
    same<Same<W.AiRunResponse, C.AiRunResponse>>();
    same<Same<W.AiDecideResponse, C.AiDecideResponse>>();
    same<Same<W.ConfigResponse, C.ConfigResponse>>();
    same<Same<W.FlagType, C.FlagType>>();
    // The API's error codes are a closed list; the SDK reads any string so new codes don't break it.
    same<[C.ErrorBody] extends [W.ErrorBody] ? true : false>();
    expect(true).toBe(true);
  });
});
