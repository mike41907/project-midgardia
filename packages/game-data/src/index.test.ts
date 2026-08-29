import { describe, expect, it } from "vitest";
import { canTraverse, findPortalAt, findWalkablePath, getMapDefinition, isWalkable } from "./index";

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

  it("finds an 8-direction route around a blocking building", () => {
    const path = findWalkablePath("sunpetal-village", { x: 1000, y: 704 }, { x: 1750, y: 704 });
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual({ x: 1750, y: 704 });
    expect(canTraverse("sunpetal-village", { x: 1000, y: 704 }, path[0])).toBe(true);
  });
});
