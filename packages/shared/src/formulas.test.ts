import { describe, expect, it } from "vitest";
import { baseExpForLevel, deriveStats, directionFromVector, statPointCost } from "./index";

describe("shared progression formulas", () => {
  it("makes stat points progressively more expensive", () => {
    expect(statPointCost(1)).toBe(2);
    expect(statPointCost(10)).toBe(3);
    expect(statPointCost(90)).toBeGreaterThan(statPointCost(10));
  });

  it("keeps experience thresholds increasing", () => {
    expect(baseExpForLevel(2)).toBeGreaterThan(baseExpForLevel(1));
    expect(baseExpForLevel(99)).toBeGreaterThan(baseExpForLevel(50));
  });

  it("derives deterministic combat-facing stats", () => {
    const stats = deriveStats(10, { str: 10, agi: 10, vit: 10, int: 10, dex: 10, luk: 10 });
    expect(stats.maxHp).toBe(340);
    expect(stats.atk).toBe(45);
    expect(stats.aspd).toBeGreaterThan(140);
  });

  it("maps movement to eight directions", () => {
    expect(directionFromVector(0, 1)).toBe("south");
    expect(directionFromVector(-1, -1)).toBe("northWest");
    expect(directionFromVector(1, 0)).toBe("east");
  });
});
