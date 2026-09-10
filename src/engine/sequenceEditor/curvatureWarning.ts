import type { PathCoordinate } from "../coordinates.js";
import type { Element } from "../element/element.js";
import { OneFootTurn } from "../element/oneFootTurn.js";
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

export function checkTurnCurvature(sequence: Sequence, element: OneFootTurn): CurvatureCheck {
  const path = sequence.path;
  const centerU = ((Math.min(element.start as number, element.end as number) +
    Math.max(element.start as number, element.end as number)) /
    2) as PathCoordinate;
  const [curve, curvilinear] = path.getCurveAndCurvilinearCoord(centerU);
  const point = curve.getPosition(curvilinear);
  const curvature = curve.getCurvature(curvilinear);

  const expectedSign = element.clockwise ? -1 : 1;
  const invalid = Math.sign(curvature) !== expectedSign;

  return { point, curvature, expectedSign, invalid };
}

export function checkSequenceTurnCurvatures(
  sequence: Sequence,
  extraElements: Element[] = [],
): Map<OneFootTurn, CurvatureCheck> {
  const checks = new Map<OneFootTurn, CurvatureCheck>();
  for (const element of [...sequence.elements, ...extraElements]) {
    if (!isTurnElement(element)) continue;
    checks.set(element, checkTurnCurvature(sequence, element));
  }
  return checks;
}
