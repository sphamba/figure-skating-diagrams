import { describe, expect, it } from "vitest";
import { Path } from "./path";
import { Sequence } from "./sequence";
import { createDefaultFootTurn } from "./turn";

/** Build a straight 5 m path with one element between u=1 and u=4. */
function makeSequence(): { sequence: Sequence; start: number; end: number } {
  const path = new Path();
  for (let i = 0; i < 5; i++) path.addCurveEnd();
  const start = 1;
  const end = 4;
  const sequence = new Sequence(path);
  sequence.addElement(createDefaultFootTurn(start as never, end as never));
  return { sequence, start, end };
}

describe("scale-aware foot trace keyframes", () => {
  it("leaves keyframes untouched when scale is 1", () => {
    const { sequence } = makeSequence();
    const unscaled = sequence.getDrawFootKeyframes("footL", 1);
    expect(unscaled).toBe(sequence.keyframes.footL);
  });

  it("re-bases keyframes onto the scaled span, keeping the middle fixed", () => {
    const { sequence, start, end } = makeSequence();
    const factor = 2;
    const scaled = sequence.getDrawFootKeyframes("footL", factor);
    const middle = (start + end) / 2;
    expect(scaled.length).toBeGreaterThan(0);
    for (const keyframe of scaled) {
      expect(keyframe.coordinate).toBeGreaterThanOrEqual(middle + (start - middle) * factor);
      expect(keyframe.coordinate).toBeLessThanOrEqual(middle + (end - middle) * factor);
    }
    // The stored sequence keyframes are unchanged.
    expect(sequence.keyframes.footL.every((k) => k.coordinate >= start && k.coordinate <= end)).toBe(true);
  });
});
