import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { Vector, getUnitVectorFromAngle } from "../src/engine/vector";
import { LeftForwardInsideThreeTurn, LeftForwardOutsideThreeTurn } from "../src/engine/element/threeTurn";
import {
  checkSequenceTurnCurvatures,
  checkTurnCurvature,
  isTurnElement,
} from "../src/engine/sequenceEditor/curvatureWarning";
import { LeftForwardInsideGlide } from "../src/engine/element/glide";
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

  const check = checkTurnCurvature(sequence, element);
  expect(check.expectedSign).toBe(-1);
  expect(check.invalid).toBe(false);
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

  const check = checkTurnCurvature(sequence, element);
  expect(check.expectedSign).toBe(1);
  expect(check.invalid).toBe(true);
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

  expect(checkTurnCurvature(sequence, element).invalid).toBe(false);
});

test("Only one-foot turn elements are checked", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const turn = new LeftForwardInsideThreeTurn("footL", 1 as PathCoordinate, 3 as PathCoordinate);
  const glide: Element = new LeftForwardInsideGlide(0 as PathCoordinate, 1 as PathCoordinate);
  sequence.addElement(turn);
  sequence.addElement(glide);

  const checks = checkSequenceTurnCurvatures(sequence, []);
  expect(checks.has(turn)).toBe(true);
  expect(checks.size).toBe(1);
  expect(isTurnElement(glide)).toBe(false);
  expect(isTurnElement(turn)).toBe(true);
});
