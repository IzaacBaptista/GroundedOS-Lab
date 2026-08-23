import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "./fusion";

describe("reciprocalRankFusion (book cap. 18)", () => {
  it("scores by position, not by raw value, so incompatible score scales don't matter", () => {
    // "a" is #1 in list A (huge raw score) and #3 in list B (tiny raw score) — RRF only sees rank 1 and rank 3.
    const listA = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const listB = [{ id: "b" }, { id: "c" }, { id: "a" }];

    const scores = reciprocalRankFusion([listA, listB]);

    // "b" is #2 in A and #1 in B — better combined rank than "a" (#1 + #3) or "c" (#3 + #2).
    const ranked = [...scores.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
    expect(ranked[0]).toBe("b");
  });

  it("sums 1/(k+rank) contributions across every list an item appears in", () => {
    const scores = reciprocalRankFusion([[{ id: "a" }], [{ id: "a" }]], 60);
    expect(scores.get("a")).toBeCloseTo(1 / 61 + 1 / 61);
  });

  it("an item missing from a list gets no contribution from that list", () => {
    const scores = reciprocalRankFusion([[{ id: "a" }], [{ id: "b" }]], 60);
    expect(scores.get("a")).toBeCloseTo(1 / 61);
    expect(scores.get("b")).toBeCloseTo(1 / 61);
  });

  it("higher k flattens the influence of rank differences", () => {
    const lists = [[{ id: "first" }, { id: "second" }]];
    const tightK = reciprocalRankFusion(lists, 1);
    const looseK = reciprocalRankFusion(lists, 1000);

    const tightGap = tightK.get("first")! - tightK.get("second")!;
    const looseGap = looseK.get("first")! - looseK.get("second")!;

    expect(tightGap).toBeGreaterThan(looseGap);
  });

  it("rejects a non-positive k", () => {
    expect(() => reciprocalRankFusion([[{ id: "a" }]], 0)).toThrow("k must be a positive number");
  });
});
