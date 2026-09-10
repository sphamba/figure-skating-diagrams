import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import { Curve } from "../src/engine/curve.js";
import { Path } from "../src/engine/path.js";
import { Sequence } from "../src/engine/sequence.js";
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

test("draw keyframes mix a real-span glide with a scaled turn", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideGlide(0.05 as PathCoordinate, 0.25 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.6 as PathCoordinate, 0.9 as PathCoordinate));

  const factor = 2;
  const drawKeyframes = sequence.getDrawFootKeyframes("footL", factor);
  const coordinates = drawKeyframes.map((keyframe) => Number(keyframe.coordinate.toFixed(10)));

  expect(coordinates.slice(0, 2)).toEqual([0.05, 0.25]);
  const [scaledStart, scaledEnd] = scaledSpan(0.6, 0.9, factor);
  expect(coordinates).toContain(Number(scaledStart.toFixed(10)));
  expect(coordinates).toContain(Number(scaledEnd.toFixed(10)));
});

test("the boundary delta still applies between unscaled glides", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideGlide(0, 0.5 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideGlide(0.5, 1 as PathCoordinate));

  expect(footLCoordinates(sequence)).toEqual([0, 0.5, 0.501, 1]);
});
