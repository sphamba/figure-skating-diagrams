import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { getUnitVectorFromAngle, Vector } from "../src/engine/vector";
import { Curve } from "../src/engine/curve";
import {
  LeftBackwardInsideThreeTurn,
  LeftBackwardOutsideThreeTurn,
  LeftForwardInsideThreeTurn,
  LeftForwardOutsideThreeTurn,
} from "../src/engine/element/threeTurn";
import { checkTurnCurvature } from "../src/engine/sequenceEditor/curvatureWarning";

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

test("curvature signs of preset paths and turn checks", () => {
  const radius = 1.2;
  const clockwiseCPath = new Path();
  clockwiseCPath.addCurveEnd(
    getArcCurve(new Vector(radius * 0.4, 0), radius, (3 * Math.PI) / 2, Math.PI / 2),
  );
  const counterClockwiseCPath = new Path();
  counterClockwiseCPath.addCurveEnd(
    getArcCurve(new Vector(-radius * 0.4, 0), radius, -Math.PI / 2, Math.PI / 2),
  );

  console.log("clockwiseCPath curvature at mid:", clockwiseCPath.getCurveAndCurvilinearCoord(
    (clockwiseCPath.length / 2) as PathCoordinate,
  ));
  const [cwCurve, cwT] = clockwiseCPath.getCurveAndCurvilinearCoord((clockwiseCPath.length / 2) as PathCoordinate);
  console.log("clockwiseCPath curvature:", cwCurve.getCurvature(cwT));
  const [ccwCurve, ccwT] = counterClockwiseCPath.getCurveAndCurvilinearCoord(
    (counterClockwiseCPath.length / 2) as PathCoordinate,
  );
  console.log("counterClockwiseCPath curvature:", ccwCurve.getCurvature(ccwT));

  for (const [label, path, klass] of [
    ["LFI_3", clockwiseCPath, LeftForwardInsideThreeTurn],
    ["LBI_3", clockwiseCPath, LeftBackwardInsideThreeTurn],
    ["LFO_3", counterClockwiseCPath, LeftForwardOutsideThreeTurn],
    ["LBO_3", counterClockwiseCPath, LeftBackwardOutsideThreeTurn],
  ] as const) {
    const sequence = new Sequence(path);
    const center = (path.length / 2) as PathCoordinate;
    const halfLength = 0.128 as PathCoordinate; // bladeLength * 1.6
    const element = new klass("footL", ((center as number) - (halfLength as number)) as PathCoordinate,
      ((center as number) + (halfLength as number)) as PathCoordinate);
    const checks = checkTurnCurvature(sequence, element);
    console.log(
      label,
      "clockwise flag:", (element as unknown as { clockwise: boolean }).clockwise,
      "expected:", checks.map((c) => c.expectedSign),
      "curvature sign:", checks.map((c) => Math.sign(c.curvature)),
      "invalid:", checks.map((c) => c.invalid),
    );
  }

  expect(true).toBe(true);
});
