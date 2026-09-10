import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import { Curve } from "../src/engine/curve.js";
import { Path } from "../src/engine/path.js";
import { Sequence } from "../src/engine/sequence.js";
import { MIN_SCALE_GAP } from "../src/engine/element/spanScaling.js";
import { LeftForwardInsideGlide } from "../src/engine/element/glide.js";
import { LeftNormalForwardInsideGlide } from "../src/engine/element/stroke.js";
import { LeftForwardInsideThreeTurn } from "../src/engine/element/threeTurn.js";
import { LeftForwardInsideLoop } from "../src/engine/element/loop.js";
import { Vector } from "../src/engine/vector.js";

function makePath(): Path {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
  return path;
}

function footLCoordinates(sequence: Sequence): number[] {
  return sequence.keyframes.footL.map((keyframe) => keyframe.coordinate);
}

function scaledSpan(start: number, end: number, factor: number): number[] {
  const middle = (start + end) / 2;
  return [middle + (start - middle) * factor, middle + (end - middle) * factor];
}

test("glides are not scalable, turns are", () => {
  const glide = new LeftForwardInsideGlide(0 as PathCoordinate, 1 as PathCoordinate);
  const stroke = new LeftNormalForwardInsideGlide(0 as PathCoordinate, 1 as PathCoordinate);
  const turn = new LeftForwardInsideThreeTurn("footL", 0 as PathCoordinate, 1 as PathCoordinate);
  const loop = new LeftForwardInsideLoop("footL", 0 as PathCoordinate, 1 as PathCoordinate);

  expect(glide.scalable).toBe(false);
  expect(stroke.scalable).toBe(false);
  expect(turn.scalable).toBe(true);
  expect(loop.scalable).toBe(true);
});

test("a glide keeps the real span under a span scale", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideGlide(0.3 as PathCoordinate, 0.7 as PathCoordinate));

  const glide = sequence.elements[0];
  expect(glide!.getLeftFootKeyframes(2).map((keyframe) => keyframe.coordinate)).toEqual([0.3, 0.7]);
  expect(glide!.getHipsKeyframes(2).map((keyframe) => keyframe.coordinate)).toEqual([0.3, 0.7]);

  expect(sequence.getDrawFootKeyframes("footL", 2).map((keyframe) => keyframe.coordinate)).toEqual([0.3, 0.7]);
});

test("a dynamic glide (stroke) keeps the real span under a span scale", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftNormalForwardInsideGlide(0.2 as PathCoordinate, 0.8 as PathCoordinate));

  expect(sequence.getDrawFootKeyframes("footL", 2).map((keyframe) => keyframe.coordinate)).toEqual([0.2, 0.77, 0.8]);
});

test("a turn re-bases its keyframes onto the scaled span", () => {
  const sequence = new Sequence(makePath());
  const start = 0.3;
  const end = 0.7;
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", start as PathCoordinate, end as PathCoordinate));

  const factor = 2;
  const [scaledStart, scaledEnd] = scaledSpan(start, end, factor);

  const turn = sequence.elements[0]!;
  const turnFootKeyframes = turn.getLeftFootKeyframes(factor);
  expect(turnFootKeyframes[0]!.coordinate).toBeCloseTo(scaledStart as number, 10);
  expect(turnFootKeyframes[turnFootKeyframes.length - 1]!.coordinate).toBeCloseTo(scaledEnd as number, 10);
  const hipsKeyframes = turn.getHipsKeyframes(factor);
  expect(hipsKeyframes[0]!.coordinate).toBeCloseTo(scaledStart as number, 10);
  expect(hipsKeyframes[hipsKeyframes.length - 1]!.coordinate).toBeCloseTo(scaledEnd as number, 10);
});

test("draw keyframes mix a real-span glide with a scaled turn inside the path", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideGlide(0.05 as PathCoordinate, 0.25 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.6 as PathCoordinate, 0.9 as PathCoordinate));

  const factor = 2;
  const drawKeyframes = sequence.getDrawFootKeyframes("footL", factor);
  const coordinates = drawKeyframes.map((keyframe) => Number(keyframe.coordinate.toFixed(10)));

  expect(coordinates.slice(0, 2)).toEqual([0.05, 0.25]);
  // The turn is clamped to the path end: the middle is 0.75 and the exit
  // reach is 0.15, so the scale stops at (1 - 0.75) / 0.15 = 1.6667.
  expect(coordinates).toContain(0.5);
  expect(coordinates).toContain(1);
});

test("the boundary delta still applies between unscaled glides", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideGlide(0, 0.5 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideGlide(0.5, 1 as PathCoordinate));

  expect(footLCoordinates(sequence)).toEqual([0, 0.5, 0.501, 1]);
});

function scaledEdges(start: number, end: number, scale: number): [number, number] {
  const middle = (start + end) / 2;
  return [middle + (start - middle) * scale, middle + (end - middle) * scale];
}

test("a scaled turn stops before neighbouring glides", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideGlide(0.05 as PathCoordinate, 0.25 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.4 as PathCoordinate, 0.6 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideGlide(0.75 as PathCoordinate, 0.95 as PathCoordinate));

  // Target scale 20: the scaling stops at the neighbour gaps, not at the
  // path bounds, which would allow up to 5.
  const scales = sequence.getSpanScales(20 * 0.25);
  const turn = sequence.elements[1]!;
  const scale = scales.get(turn)!;
  expect(scale).toBeGreaterThan(1);
  expect(scale).toBeLessThan(5);
  const [scaledStart, scaledEnd] = scaledEdges(0.4, 0.6, scale);
  expect(scaledStart).toBeCloseTo(0.25 + MIN_SCALE_GAP, 6);
  expect(scaledEnd).toBeCloseTo(0.75 - MIN_SCALE_GAP, 6);
  expect(scales.get(sequence.elements[0]!)).toBe(1);
});

test("adjacent scalable turns stop growing when they collide and split the space", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.3 as PathCoordinate, 0.5 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideThreeTurn("footR", 0.55 as PathCoordinate, 0.75 as PathCoordinate));

  const scales = sequence.getSpanScales(100 * 0.25);
  const [scaleA, scaleB] = [...scales.values()];
  expect(scaleA).toBeGreaterThan(1);
  expect(scaleB).toBeGreaterThan(1);
  expect(scaleA).toBeLessThan(100);
  expect(scaleB).toBeLessThan(100);
  const [, endA] = scaledEdges(0.3, 0.5, scaleA!);
  const [startB] = scaledEdges(0.55, 0.75, scaleB!);
  expect(startB - endA).toBeCloseTo(MIN_SCALE_GAP, 6);
});

test("a scaled turn does not reach past its direct neighbour", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.1 as PathCoordinate, 0.2 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideGlide(0.21 as PathCoordinate, 0.3 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideThreeTurn("footR", 0.31 as PathCoordinate, 0.5 as PathCoordinate));

  const scales = sequence.getSpanScales(50 * 0.25);
  const turnA = sequence.elements[0]!;
  const turnC = sequence.elements[2]!;
  const [, endA] = scaledEdges(0.1, 0.2, scales.get(turnA)!);
  const [startC] = scaledEdges(0.31, 0.5, scales.get(turnC)!);
  // The middle glide is fixed, so the turns stop at its span and can never
  // reach past it towards the elements beyond.
  expect(endA).toBeCloseTo(0.21 - MIN_SCALE_GAP, 6);
  expect(startC).toBeCloseTo(0.3 + MIN_SCALE_GAP, 6);
});

test("scaled turns never shrink below their real span", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0 as PathCoordinate, 0.5 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideThreeTurn("footR", 0.5 as PathCoordinate, 1 as PathCoordinate));

  const scales = sequence.getSpanScales(10 * 0.25);
  for (const scale of scales.values()) {
    expect(scale).toBe(1);
  }
});

test("a scaled turn next to the path start stops at the path bounds", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.02 as PathCoordinate, 0.08 as PathCoordinate));

  const scales = sequence.getSpanScales(50 * 0.25);
  const scale = scales.get(sequence.elements[0]!)!;
  expect(scale).toBeCloseTo(0.05 / 0.03, 6);
  const [scaledStart] = scaledEdges(0.02, 0.08, scale);
  expect(scaledStart).toBeCloseTo(0, 6);
});

test("scaled draw keyframes stay ordered with gaps between elements", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideGlide(0.05 as PathCoordinate, 0.25 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.55 as PathCoordinate, 0.65 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideGlide(0.75 as PathCoordinate, 0.95 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideThreeTurn("footR", 0.96 as PathCoordinate, 0.99 as PathCoordinate));

  const coordinates = sequence.getDrawFootKeyframes("footL", 20).map((keyframe) => keyframe.coordinate);
  expect(coordinates.length).toBeGreaterThan(4);
  for (let index = 1; index < coordinates.length; index++) {
    expect(coordinates[index]).toBeGreaterThan(coordinates[index - 1]);
  }
  expect(coordinates[0]).toBeGreaterThanOrEqual(0);
  expect(coordinates[coordinates.length - 1]).toBeLessThanOrEqual(1);
});
