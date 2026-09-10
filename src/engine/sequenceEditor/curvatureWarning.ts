import type { PathCoordinate } from "../coordinates.js";
import type { Element } from "../element/element.js";
import { OneFootTurn } from "../element/oneFootTurn.js";
import { Rocker } from "../element/rocker.js";
import { Counter } from "../element/counter.js";
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

function midpointU(element: OneFootTurn): PathCoordinate {
  return ((Math.min(element.start as number, element.end as number) +
    Math.max(element.start as number, element.end as number)) /
    2) as PathCoordinate;
}

export function checkTurnCurvature(sequence: Sequence, element: OneFootTurn): CurvatureCheck[] {
  const baseExpectedSign = (element.clockwise ? -1 : 1) as number;
  if (element instanceof Rocker || element instanceof Counter) {
    // Probe the start and end points. The start point follows the entry edge
    // like the middle point of a three-turn or bracket. The end point follows
    // the exit edge, which curves opposite to the entry edge.
    return [
      checkAtCurvilinear(sequence, element.start as PathCoordinate, baseExpectedSign),
      checkAtCurvilinear(sequence, element.end as PathCoordinate, -baseExpectedSign as number),
    ];
  }
  return [checkAtCurvilinear(sequence, midpointU(element), baseExpectedSign)];
}

export function checkSequenceTurnCurvatures(sequence: Sequence, extraElements: Element[] = []): CurvatureCheck[] {
  const checks: CurvatureCheck[] = [];
  for (const element of [...sequence.elements, ...extraElements]) {
    if (!isTurnElement(element)) continue;
    checks.push(...checkTurnCurvature(sequence, element));
  }
  return checks;
}
