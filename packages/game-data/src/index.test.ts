import { describe, expect, it } from "vitest";
import { canTraverse, findPortalAt, getMapDefinition, isWalkable } from "./index";

describe("original world data", () => {
  it("contains both Phase 1 maps and a portal connection", () => {
    expect(getMapDefinition("sunpetal-village").npcs.length).toBeGreaterThan(0);
    expect(findPortalAt("sunpetal-village", { x: 1792, y: 704 })?.toMapId).toBe("emberfall-town");
  });

  it("rejects walls and accepts open ground", () => {
    expect(isWalkable("sunpetal-village", 960, 704)).toBe(true);
    expect(isWalkable("sunpetal-village", 400, 400)).toBe(false);
    expect(canTraverse("sunpetal-village", { x: 960, y: 704 }, { x: 1056, y: 704 })).toBe(true);
  });
});
