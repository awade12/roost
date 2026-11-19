import { describe, expect, it } from "vitest";
import { pickEnvironment, pickOrg } from "../pick.ts";

const none = { orgId: null, environmentId: null };
const games = [
  { id: "g0", name: "Empty", environments: [] },
  { id: "g1", name: "Chrona", environments: [{ id: "dev", name: "development" }, { id: "prod", name: "production" }] },
  { id: "g2", name: "Other", environments: [{ id: "o-dev", name: "development" }] },
];

describe("pickOrg", () => {
  const orgs = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  it("keeps the remembered studio and falls back to the first", () => {
    expect(pickOrg(orgs, { ...none, orgId: "b" })?.id).toBe("b");
    expect(pickOrg(orgs, { ...none, orgId: "gone" })?.id).toBe("a");
    expect(pickOrg([], none)).toBeNull();
  });
});

describe("pickEnvironment", () => {
  it("keeps the remembered environment, in whichever game it is", () => {
    expect(pickEnvironment(games, { ...none, environmentId: "o-dev" })).toMatchObject({ game: { id: "g2" }, environment: { id: "o-dev" } });
  });

  it("otherwise opens production of the first game that has environments", () => {
    expect(pickEnvironment(games, { ...none, environmentId: "deleted" })).toMatchObject({ game: { id: "g1" }, environment: { id: "prod" } });
  });

  it("is null with no environments at all", () => {
    expect(pickEnvironment(games.slice(0, 1), none)).toBeNull();
  });
});
