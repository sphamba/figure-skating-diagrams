import { describe, expect, it } from "vitest";
import { Path } from "./path";
import { Vector } from "./vector";
import { Sequence } from "./sequence";
import { createDefaultFootTurn } from "./element/turnTypes";
import { LeftForwardInsideGlide } from "./element/glide";
import { LeftForwardInsideThreeTurn } from "./element/threeTurn";

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
    expect(sequence.keyframes.footL.every((k) => k.coordinate >= start && k.coordinate <= end)).toBe(true);
  });
});

describe("path real lengths", () => {
  it("keeps path coordinates equal to real arc length after a path edit", () => {
    const path = new Path();
    for (let i = 0; i < 5; i++) path.addCurveEnd();
    expect(path.length).toBeCloseTo(25, 4);

    const curve = path.curves[0]!;
    curve.p1 = curve.p0.plus(new Vector(1.8, 0));
    curve.p2 = curve.p0.plus(new Vector(2.2, 0));
    curve.p3 = curve.p0.plus(new Vector(3, 0));
    path.updateLength();

    let real = 0;
    for (const c of path.curves) real += c.arcLength(0 as never, 1 as never);
    expect(path.length).toBeCloseTo(real, 2);

    for (let u = 0.4; u <= path.length - 0.4; u += 0.5) {
      expect(path.arcLengthBetween((u - 0.4) as never, (u + 0.4) as never)).toBeCloseTo(0.8, 2);
    }
  });
});

describe("sequence-level hips keyframes", () => {
  it("a single glide keeps finite hips orientation at the exact element end", () => {
    const path = new Path();
    path.addCurveEnd();
    const sequence = new Sequence(path);
    sequence.addElement(new LeftForwardInsideGlide(0 as never, 1 as never));

    expect(sequence.keyframes.hips).toHaveLength(1);
    expect(sequence.keyframes.hips[0]!.coordinate).toBe(1);
    expect(sequence.keyframes.hips[0]!.data.orientation!.real).toBeCloseTo(1, 10);
    // The single keyframe gives no span to interpolate over, so the angle stays finite.
    expect(Number.isFinite(sequence.getFloorAngle("hips", 1 as never))).toBe(true);
    expect(Number.isFinite(sequence.getFloorAngle("hips", path.length as never))).toBe(true);
  });

  it("a glide followed by a turn interpolates the hips across the boundary", () => {
    const path = new Path();
    path.addCurveEnd();
    const sequence = new Sequence(path);
    sequence.addElement(new LeftForwardInsideGlide(0 as never, 1 as never));
    sequence.addElement(new LeftForwardInsideThreeTurn("footL", 1 as never, 2 as never));

    const coordinates = sequence.keyframes.hips.map((keyframe) => keyframe.coordinate);
    expect(coordinates).toEqual([1, 1.001, 1.5, 2]);
    // The glide keeps its forward hips orientation from a single keyframe.
    expect(sequence.keyframes.hips[0]!.data.orientation!.real).toBeCloseTo(1, 10);
    for (const u of [0.0, 0.5, 1, 1.25, 1.75, 2]) {
      expect(Number.isFinite(sequence.getFloorAngle("hips", u as never))).toBe(true);
    }
  });
});
