import type { PathCoordinate } from "../coordinates.js";
import type { Element } from "../element/element.js";
import { OneFootTurn } from "../element/oneFootTurn.js";
import { Rocker } from "../element/rocker.js";
import { Counter } from "../element/counter.js";
import { Glide } from "../element/glide.js";
import { DynamicGlide } from "../element/stroke.js";
import type { Sequence } from "../sequence.js";
import { Vector } from "../vector.js";

export type CurvatureCheck = {
  point: Vector<2>;
  curvature: number;
  expectedSign: number;
  invalid: boolean;
};

export function isTurnElement(element: Element): element is OneFootTurn {
  return element instanceof OneFootTurn;
}

function checkAtCurvilinear(sequence: Sequence, u: PathCoordinate, expectedSign: number): CurvatureCheck {
  const [curve, curvilinear] = sequence.path.getCurveAndCurvilinearCoord(u);
  const point = curve.getPosition(curvilinear);
  const curvature = curve.getCurvature(curvilinear);
  const invalid = Math.sign(curvature) !== expectedSign;
  return { point, curvature, expectedSign, invalid };
}

function midpointU(start: PathCoordinate, end: PathCoordinate): PathCoordinate {
  return ((Math.min(start as number, end as number) + Math.max(start as number, end as number)) / 2) as PathCoordinate;
}

export function checkTurnCurvature(sequence: Sequence, element: OneFootTurn): CurvatureCheck[] {
  const baseExpectedSign = (element.clockwise ? -1 : 1) as number;
  if (element instanceof Rocker || element instanceof Counter) {
    return [
      checkAtCurvilinear(sequence, element.start as PathCoordinate, baseExpectedSign),
      checkAtCurvilinear(sequence, element.end as PathCoordinate, -baseExpectedSign as number),
    ];
  }
  return [checkAtCurvilinear(sequence, midpointU(element.start, element.end), baseExpectedSign)];
}

export function isStrokeElement(element: Element): element is DynamicGlide {
  return element instanceof DynamicGlide;
}

export function checkStrokeCurvature(sequence: Sequence, element: DynamicGlide): CurvatureCheck[] {
  if (element.edge === "neither") return [];
  const expectedSign = (element.clockwise ? -1 : 1) as number;
  return [checkAtCurvilinear(sequence, element.end as PathCoordinate, expectedSign)];
}

export function isGlideElement(element: Element): element is Glide {
  return element instanceof Glide && !(element instanceof DynamicGlide);
}

export function checkGlideCurvature(sequence: Sequence, element: Glide): CurvatureCheck[] {
  if (element.edge === "neither") return [];
  const expectedSign = (element.clockwise ? -1 : 1) as number;
  return [
    checkAtCurvilinear(
      sequence,
      midpointU(element.start as PathCoordinate, element.end as PathCoordinate),
      expectedSign,
    ),
  ];
}

export function checkSequenceCurvatures(sequence: Sequence, extraElements: Element[] = []): CurvatureCheck[] {
  const checks: CurvatureCheck[] = [];
  for (const element of [...sequence.elements, ...extraElements]) {
    if (isTurnElement(element)) checks.push(...checkTurnCurvature(sequence, element));
    if (isStrokeElement(element)) checks.push(...checkStrokeCurvature(sequence, element));
    if (isGlideElement(element)) checks.push(...checkGlideCurvature(sequence, element));
  }
  return checks;
}
