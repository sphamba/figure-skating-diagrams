import { describe, expect, it } from "vitest";
import { Path } from "./path";
import { Vector } from "./vector";
import { Sequence } from "./sequence";
import { createDefaultFootTurn } from "./element/turnTypes";

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

describe("path real lengths", () => {
  it("keeps path coordinates equal to real arc length after a path edit", () => {
    const path = new Path();
    for (let i = 0; i < 5; i++) path.addCurveEnd();
    expect(path.length).toBeCloseTo(25, 4);

    // Drag the first curve's controls so it stretches from 1 m to 3 m.
    const curve = path.curves[0]!;
    curve.p1 = curve.p0.plus(new Vector(1.8, 0));
    curve.p2 = curve.p0.plus(new Vector(2.2, 0));
    curve.p3 = curve.p0.plus(new Vector(3, 0));
    path.updateLength();

    // The recomputed length must match the real arc length of every curve.
    let real = 0;
    for (const c of path.curves) real += c.arcLength(0 as never, 1 as never);
    expect(path.length).toBeCloseTo(real, 2);

    // Any 0.8 m path-coordinate span must really measure 0.8 m of arc.
    for (let u = 0.4; u <= path.length - 0.4; u += 0.5) {
      expect(path.arcLengthBetween((u - 0.4) as never, (u + 0.4) as never)).toBeCloseTo(0.8, 2);
    }
  });
});
