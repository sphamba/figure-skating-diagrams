import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { Vector, getUnitVectorFromAngle } from "../src/engine/vector";
import { LeftForwardInsideThreeTurn, LeftForwardOutsideThreeTurn } from "../src/engine/element/threeTurn";
import { twizzleConstructorsByType } from "../src/engine/element/twizzle";
import {
  checkGlideCurvature,
  checkSequenceCurvatures,
  checkTurnCurvature,
  isGlideElement,
  isStrokeElement,
  isTurnElement,
} from "../src/engine/sequenceEditor/curvatureWarning";
import { type Glide, glideConstructorsByType, LeftForwardInsideGlide } from "../src/engine/element/glide";
import { DynamicGlide, LeftNormalForwardInsideGlide } from "../src/engine/element/stroke";
import { Element } from "../src/engine/element/element";

function getArcCurve(center: Vector<2>, radius: number, startAngle: number, endAngle: number): Curve {
  const angle = endAngle - startAngle;
  const startNormal = getUnitVectorFromAngle(startAngle);
  const endNormal = getUnitVectorFromAngle(endAngle);
  const startTangent = startNormal.getOrthogonal().times(Math.sign(angle));
  const endTangent = endNormal.getOrthogonal().times(-Math.sign(angle));
  const controlPointDistance = (4 / 3) * Math.tan(Math.abs(angle) / 4) * radius;

  const p0 = center.plus(startNormal.times(radius));
  const p1 = p0.plus(startTangent.times(controlPointDistance));
  const p3 = center.plus(endNormal.times(radius));
  const p2 = p3.plus(endTangent.times(controlPointDistance));

  return new Curve(p0, p1, p2, p3);
}

function clockwisePath(): Path {
  const path = new Path();
  const radius = 5;
  path.addCurveEnd(getArcCurve(new Vector(0, -radius), radius, (3 * Math.PI) / 2, Math.PI / 2));
  return path;
}

function counterclockwisePath(): Path {
  const path = new Path();
  const radius = 5;
  path.addCurveEnd(getArcCurve(new Vector(0, radius), radius, -Math.PI / 2, Math.PI / 2));
  return path;
}

test("A clockwise turn on a clockwise path is valid", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const element = new LeftForwardInsideThreeTurn(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(element);

  const checks = checkTurnCurvature(sequence, element);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(-1);
  expect(checks[0].invalid).toBe(false);
});

test("A counterclockwise turn on a clockwise path is invalid", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const element = new LeftForwardOutsideThreeTurn(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(element);

  const checks = checkTurnCurvature(sequence, element);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(1);
  expect(checks[0].invalid).toBe(true);
});

test("A counterclockwise turn on a counterclockwise path is valid", () => {
  const path = counterclockwisePath();
  const sequence = new Sequence(path);
  const element = new LeftForwardOutsideThreeTurn(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(element);

  expect(checkTurnCurvature(sequence, element)[0].invalid).toBe(false);
});

test("A twizzle gets only one curvature check, at the start of the element", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const element = new twizzleConstructorsByType["LeftForwardInsideTwizzle1.5"]!(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(element);

  const checks = checkTurnCurvature(sequence, element);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(-1);
  expect(checks[0].invalid).toBe(false);
  const [curve, curvilinear] = path.getCurveAndCurvilinearCoord(element.start as PathCoordinate);
  const expectedPoint = curve.getPosition(curvilinear);
  expect(checks[0].point.x).toBeCloseTo(expectedPoint.x, 10);
  expect(checks[0].point.y).toBeCloseTo(expectedPoint.y, 10);
});

test("A twizzle on the wrong edge direction is invalid", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const element = new twizzleConstructorsByType["LeftForwardOutsideTwizzle1.5"]!(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(element);

  const checks = checkTurnCurvature(sequence, element);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(1);
  expect(checks[0].invalid).toBe(true);
});

test("A twizzle on a counterclockwise path with a matching edge is valid", () => {
  const path = counterclockwisePath();
  const sequence = new Sequence(path);
  const element = new twizzleConstructorsByType["LeftForwardOutsideTwizzle1.5"]!(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(element);

  const checks = checkTurnCurvature(sequence, element);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(1);
  expect(checks[0].invalid).toBe(false);
});

test("Turn, stroke, and glide elements are checked", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const turn = new LeftForwardInsideThreeTurn("footL", 1 as PathCoordinate, 3 as PathCoordinate);
  const stroke: Element = new LeftNormalForwardInsideGlide(0 as PathCoordinate, 1 as PathCoordinate);
  const glide: Element = new LeftForwardInsideGlide(0 as PathCoordinate, 1 as PathCoordinate);
  sequence.addElement(turn);
  sequence.addElement(stroke);
  sequence.addElement(glide);

  const checks = checkSequenceCurvatures(sequence, []);
  expect(checks.length).toBe(3);
  expect(isTurnElement(glide)).toBe(false);
  expect(isTurnElement(turn)).toBe(true);
  expect(isStrokeElement(glide)).toBe(false);
  expect(isStrokeElement(stroke)).toBe(true);
  expect(isGlideElement(glide)).toBe(true);
  expect(isGlideElement(stroke)).toBe(false);
});

test("A stroke on a matching path is valid", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const stroke = new LeftNormalForwardInsideGlide(
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(stroke);

  const checks = checkSequenceCurvatures(sequence);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(-1);
  expect(checks[0].invalid).toBe(false);
});

test("A stroke on an opposite path is invalid", () => {
  const path = counterclockwisePath();
  const sequence = new Sequence(path);
  const stroke = new LeftNormalForwardInsideGlide(
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(stroke);

  const checks = checkSequenceCurvatures(sequence);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(-1);
  expect(checks[0].invalid).toBe(true);
});

test("A stroke with a neither edge is not checked", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const stroke = new (glideConstructorsByType["LeftNormalForwardGlide"] as unknown as new (
    start: number,
    end: number,
  ) => DynamicGlide)((path.length / 4) as PathCoordinate, ((3 * path.length) / 4) as PathCoordinate);
  sequence.addElement(stroke);

  expect(checkSequenceCurvatures(sequence)).toHaveLength(0);
});

test("A stroke is checked only at its end point", () => {
  const path = new Path();
  const radius = 5;
  path.addCurveEnd(getArcCurve(new Vector(0, radius), radius, -Math.PI / 2, Math.PI / 2));
  path.addCurveEnd(getArcCurve(new Vector(0, 3 * radius), radius, (3 * Math.PI) / 2, Math.PI / 2));
  const sequence = new Sequence(path);
  const stroke = new LeftNormalForwardInsideGlide((path.length / 4) as PathCoordinate, path.length as PathCoordinate);
  sequence.addElement(stroke);

  const checks = checkSequenceCurvatures(sequence);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(-1);
  expect(checks[0].invalid).toBe(false);
  const [curve, curvilinear] = path.getCurveAndCurvilinearCoord(path.length as PathCoordinate);
  const expected = curve.getPosition(curvilinear);
  expect(checks[0].point.x).toBeCloseTo(expected.x, 10);
  expect(checks[0].point.y).toBeCloseTo(expected.y, 10);
});

test("A backward stroke on a matching path is valid", () => {
  const path = counterclockwisePath();
  const sequence = new Sequence(path);
  const stroke = new (glideConstructorsByType["LeftNormalBackwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => DynamicGlide)((path.length / 4) as PathCoordinate, ((3 * path.length) / 4) as PathCoordinate);
  sequence.addElement(stroke);

  const checks = checkSequenceCurvatures(sequence);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(1);
  expect(checks[0].invalid).toBe(false);
});

test("A crossed stroke is checked like a normal stroke", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const stroke = new (glideConstructorsByType["LeftCrossedForwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => DynamicGlide)((path.length / 4) as PathCoordinate, ((3 * path.length) / 4) as PathCoordinate);
  sequence.addElement(stroke);

  const checks = checkSequenceCurvatures(sequence);
  expect(checks.length).toBe(1);
  expect(checks[0].invalid).toBe(false);
});

test("A glide on a matching path is valid", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const glide = new LeftForwardInsideGlide(
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(glide);

  const checks = checkSequenceCurvatures(sequence);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(-1);
  expect(checks[0].invalid).toBe(false);
});

test("A glide on an opposite path is invalid", () => {
  const path = counterclockwisePath();
  const sequence = new Sequence(path);
  const glide = new LeftForwardInsideGlide(
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(glide);

  const checks = checkGlideCurvature(sequence, glide);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(-1);
  expect(checks[0].invalid).toBe(true);
});

test("A glide with a neither edge is not checked", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const glide = new (glideConstructorsByType["LeftForwardGlide"] as unknown as new (
    start: number,
    end: number,
  ) => Glide)((path.length / 4) as PathCoordinate, ((3 * path.length) / 4) as PathCoordinate);
  sequence.addElement(glide);

  expect(checkSequenceCurvatures(sequence)).toHaveLength(0);
});

test("A backward glide on a matching path is valid", () => {
  const path = counterclockwisePath();
  const sequence = new Sequence(path);
  const glide = new (glideConstructorsByType["LeftBackwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => Glide)((path.length / 4) as PathCoordinate, ((3 * path.length) / 4) as PathCoordinate);
  sequence.addElement(glide);

  const checks = checkSequenceCurvatures(sequence);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(1);
  expect(checks[0].invalid).toBe(false);
});

test("A glide is checked only at its middle point", () => {
  const path = new Path();
  const radius = 5;
  path.addCurveEnd(getArcCurve(new Vector(0, radius), radius, -Math.PI / 2, Math.PI / 2));
  path.addCurveEnd(getArcCurve(new Vector(0, 3 * radius), radius, (3 * Math.PI) / 2, Math.PI / 2));
  path.addCurveEnd(getArcCurve(new Vector(0, 5 * radius), radius, -Math.PI / 2, Math.PI / 2));
  const sequence = new Sequence(path);
  const glide = new LeftForwardInsideGlide((path.length / 4) as PathCoordinate, (0.95 * path.length) as PathCoordinate);
  sequence.addElement(glide);

  const checks = checkSequenceCurvatures(sequence);
  expect(checks.length).toBe(1);
  expect(checks[0].expectedSign).toBe(-1);
  expect(checks[0].invalid).toBe(false);
  const [start, end] = [path.length / 4, 0.95 * path.length];
  const midU = ((Math.min(start, end) + Math.max(start, end)) / 2) as PathCoordinate;
  const [curve, curvilinear] = path.getCurveAndCurvilinearCoord(midU);
  const expectedPoint = curve.getPosition(curvilinear);
  expect(checks[0].point.x).toBeCloseTo(expectedPoint.x, 10);
  expect(checks[0].point.y).toBeCloseTo(expectedPoint.y, 10);
});
