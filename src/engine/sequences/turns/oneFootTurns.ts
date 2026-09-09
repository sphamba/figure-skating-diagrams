import { Curve } from "../../curve.js";
import type { PathCoordinate, Time } from "../../coordinates.js";
import { FootKeyframe, TimeKeyframe } from "../../keyframe.js";
import { Path } from "../../path.js";
import { getQuaternionFromAngleAxis } from "../../quaternion.js";
import { getOppositeFootKey, Sequence } from "../../sequence.js";
import type { FootKey } from "../../sequence.js";
import {
  LeftBackwardInsideThreeTurn,
  LeftBackwardOutsideThreeTurn,
  LeftForwardInsideThreeTurn,
  LeftForwardOutsideThreeTurn,
} from "../../element/threeTurn.js";
import {
  LeftBackwardInsideLoop,
  LeftBackwardOutsideLoop,
  LeftForwardInsideLoop,
  LeftForwardOutsideLoop,
} from "../../element/loop.js";
import type { FootTurnConstructor } from "../../element/turn.js";
import { defaultFootTurnLength } from "../../element/turn.js";
import { getUnitVectorFromAngle, Vector } from "../../vector.js";

const pathRadius = 1.2; // meters
const freeFootHeight = 0.2; // meters
const CPathCenterShiftFactor = 0.4; // times pathRadius
const CPathDuration = 2 as Time; // seconds
const SPathDuration = 4 as Time; // seconds

const skatingFootInitialOrFinalData = {
  position: new Vector<3>(0, 0, 0),
};

const skatingFootInitialKeyframe = new FootKeyframe(0 as PathCoordinate, skatingFootInitialOrFinalData);

const freeFootInitialData = {
  position: new Vector<3>(0, 0, freeFootHeight),
  orientation: getQuaternionFromAngleAxis(0),
  contactPoint: 0.5,
};

const freeFootInitialKeyframe = new FootKeyframe(0 as PathCoordinate, freeFootInitialData);

function getArcCurve(center: Vector<2>, radius: number, startAngle: number, endAngle: number): Curve {
  const angle = endAngle - startAngle;
  const startNormal = getUnitVectorFromAngle(startAngle);
  const endNormal = getUnitVectorFromAngle(endAngle);
  const startTangent = startNormal.getOrthogonal().times(Math.sign(angle));
  const endTangent = endNormal.getOrthogonal().times(-Math.sign(angle));
  // https://stackoverflow.com/questions/1734745/how-to-create-circle-with-b%C3%A9zier-curves
  const controlPointDistance = (4 / 3) * Math.tan(Math.abs(angle) / 4) * radius;

  const p0 = center.plus(startNormal.times(radius));
  const p1 = p0.plus(startTangent.times(controlPointDistance));
  const p3 = center.plus(endNormal.times(radius));
  const p2 = p3.plus(endTangent.times(controlPointDistance));

  return new Curve(p0, p1, p2, p3);
}

function createTurn(
  footKey: FootKey,
  path: Path,
  turnClass: FootTurnConstructor,
  duration: Time = CPathDuration,
): Sequence {
  const turn = new Sequence(path);
  turn.addKeyframe("time", new TimeKeyframe(duration, { pathCoordinate: path.length as PathCoordinate }));
  // Body part keyframes sit on the path coordinate axis (u).
  turn.addKeyframe(footKey, skatingFootInitialKeyframe); // u = 0
  turn.addKeyframe(getOppositeFootKey(footKey), freeFootInitialKeyframe); // u = 0
  const center = (path.length / 2) as PathCoordinate; // placed at path midpoint
  const halfLength = defaultFootTurnLength;
  turn.addElement(
    new turnClass(
      footKey,
      (center - halfLength) as PathCoordinate,
      (center + halfLength) as PathCoordinate,
      true,
      true,
    ),
  );
  turn.addKeyframe(footKey, new FootKeyframe(path.length as PathCoordinate, skatingFootInitialOrFinalData)); // u = path.length
  return turn;
}

// Paths //////////////////////////////////////////////////////////////////////

const clockwiseCPath = new Path();

clockwiseCPath.addCurveEnd(
  getArcCurve(new Vector(pathRadius * CPathCenterShiftFactor, 0), pathRadius, (3 * Math.PI) / 2, Math.PI / 2),
);

const counterClockwiseCPath = new Path();

counterClockwiseCPath.addCurveEnd(
  getArcCurve(new Vector(-pathRadius * CPathCenterShiftFactor, 0), pathRadius, -Math.PI / 2, Math.PI / 2),
);

const clockwiseSPath = new Path();

clockwiseSPath.addCurveEnd(getArcCurve(new Vector(0, -pathRadius), pathRadius, (3 * Math.PI) / 2, Math.PI / 2));

clockwiseSPath.addCurveEnd(getArcCurve(new Vector(0, pathRadius), pathRadius, -Math.PI / 2, Math.PI / 2));

const counterClockwiseSPath = new Path();

counterClockwiseSPath.addCurveEnd(getArcCurve(new Vector(0, -pathRadius), pathRadius, -Math.PI / 2, Math.PI / 2));

counterClockwiseSPath.addCurveEnd(getArcCurve(new Vector(0, pathRadius), pathRadius, (3 * Math.PI) / 2, Math.PI / 2));

// 3-turns ////////////////////////////////////////////////////////////////////

export const LFI_3 = createTurn("footL", clockwiseCPath, LeftForwardInsideThreeTurn);
export const LFO_3 = createTurn("footL", counterClockwiseCPath, LeftForwardOutsideThreeTurn);
export const LBI_3 = createTurn("footL", clockwiseCPath, LeftBackwardInsideThreeTurn);
export const LBO_3 = createTurn("footL", counterClockwiseCPath, LeftBackwardOutsideThreeTurn);
export const RFI_3 = createTurn("footR", counterClockwiseCPath, LeftForwardOutsideThreeTurn);
export const RFO_3 = createTurn("footR", clockwiseCPath, LeftForwardInsideThreeTurn);
export const RBI_3 = createTurn("footR", counterClockwiseCPath, LeftBackwardOutsideThreeTurn);
export const RBO_3 = createTurn("footR", clockwiseCPath, LeftBackwardInsideThreeTurn);

// Brackets ///////////////////////////////////////////////////////////////////

export const LFI_B = createTurn("footL", clockwiseCPath, LeftForwardOutsideThreeTurn);
export const LFO_B = createTurn("footL", counterClockwiseCPath, LeftForwardInsideThreeTurn);
export const LBI_B = createTurn("footL", clockwiseCPath, LeftBackwardOutsideThreeTurn);
export const LBO_B = createTurn("footL", counterClockwiseCPath, LeftBackwardInsideThreeTurn);
export const RFI_B = createTurn("footR", counterClockwiseCPath, LeftForwardInsideThreeTurn);
export const RFO_B = createTurn("footR", clockwiseCPath, LeftForwardOutsideThreeTurn);
export const RBI_B = createTurn("footR", counterClockwiseCPath, LeftBackwardInsideThreeTurn);
export const RBO_B = createTurn("footR", clockwiseCPath, LeftBackwardOutsideThreeTurn);

// Rockers ////////////////////////////////////////////////////////////////////

export const LFI_RK = createTurn("footL", clockwiseSPath, LeftForwardInsideThreeTurn, SPathDuration);
export const LFO_RK = createTurn("footL", counterClockwiseSPath, LeftForwardOutsideThreeTurn, SPathDuration);
export const LBI_RK = createTurn("footL", clockwiseSPath, LeftBackwardInsideThreeTurn, SPathDuration);
export const LBO_RK = createTurn("footL", counterClockwiseSPath, LeftBackwardOutsideThreeTurn, SPathDuration);
export const RFI_RK = createTurn("footR", counterClockwiseSPath, LeftForwardOutsideThreeTurn, SPathDuration);
export const RFO_RK = createTurn("footR", clockwiseSPath, LeftForwardInsideThreeTurn, SPathDuration);
export const RBI_RK = createTurn("footR", counterClockwiseSPath, LeftBackwardOutsideThreeTurn, SPathDuration);
export const RBO_RK = createTurn("footR", clockwiseSPath, LeftBackwardInsideThreeTurn, SPathDuration);

// Counters ///////////////////////////////////////////////////////////////////

export const LFI_CTR = createTurn("footL", clockwiseSPath, LeftForwardOutsideThreeTurn, SPathDuration);
export const LFO_CTR = createTurn("footL", counterClockwiseSPath, LeftForwardInsideThreeTurn, SPathDuration);
export const LBI_CTR = createTurn("footL", clockwiseSPath, LeftBackwardOutsideThreeTurn, SPathDuration);
export const LBO_CTR = createTurn("footL", counterClockwiseSPath, LeftBackwardInsideThreeTurn, SPathDuration);
export const RFI_CTR = createTurn("footR", counterClockwiseSPath, LeftForwardInsideThreeTurn, SPathDuration);
export const RFO_CTR = createTurn("footR", clockwiseSPath, LeftForwardOutsideThreeTurn, SPathDuration);
export const RBI_CTR = createTurn("footR", counterClockwiseSPath, LeftBackwardInsideThreeTurn, SPathDuration);
export const RBO_CTR = createTurn("footR", clockwiseSPath, LeftBackwardOutsideThreeTurn, SPathDuration);

// Loops //////////////////////////////////////////////////////////////////////

export const LFI_Loop = createTurn("footL", clockwiseCPath, LeftForwardInsideLoop);
export const LFO_Loop = createTurn("footL", counterClockwiseCPath, LeftForwardOutsideLoop);
export const LBI_Loop = createTurn("footL", clockwiseCPath, LeftBackwardInsideLoop);
export const LBO_Loop = createTurn("footL", counterClockwiseCPath, LeftBackwardOutsideLoop);
export const RFI_Loop = createTurn("footR", counterClockwiseCPath, LeftForwardOutsideLoop);
export const RFO_Loop = createTurn("footR", clockwiseCPath, LeftForwardInsideLoop);
export const RBI_Loop = createTurn("footR", counterClockwiseCPath, LeftBackwardOutsideLoop);
export const RBO_Loop = createTurn("footR", clockwiseCPath, LeftBackwardInsideLoop);
