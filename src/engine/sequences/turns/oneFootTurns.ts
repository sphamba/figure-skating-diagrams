import { Curve } from '../../curve.js'
import { FootKeyframe, TimeKeyframe } from '../../keyframe.js'
import { Path } from '../../path.js'
import { getQuaternionFromAngleAxis } from '../../quaternion.js'
import { FootKey, getOppositeFootKey, Sequence } from '../../sequence.js'
import {
  BackwardClockwiseFootLoop,
  BackwardClockwiseFootTurn,
  BackwardCounterClockwiseFootLoop,
  BackwardCounterClockwiseFootTurn,
  FootTurnConstructor,
  ForwardClockwiseFootLoop,
  ForwardClockwiseFootTurn,
  ForwardCounterClockwiseFootLoop,
  ForwardCounterClockwiseFootTurn,
} from '../../turn.js'
import { getUnitVectorFromAngle, Vector } from '../../vector.js'

const pathRadius = 1.2 // meters
const freeFootHeight = 0.2 // meters
const CPathCenterShiftFactor = 0.4 // times pathRadius
const CPathDuration = 2 // seconds
const SPathDuration = 4 // seconds

const skatingFootInitialOrFinalData = {
  position: new Vector<3>(0, 0, 0),
}

const skatingFootInitialKeyframe = new FootKeyframe(0, skatingFootInitialOrFinalData)

const freeFootInitialData = {
  position: new Vector<3>(0, 0, freeFootHeight),
  orientation: getQuaternionFromAngleAxis(0),
  contactPoint: 0.5,
}

const freeFootInitialKeyframe = new FootKeyframe(0, freeFootInitialData)

function getArcCurve(
  center: Vector<2>,
  radius: number,
  startAngle: number,
  endAngle: number,
): Curve {
  const angle = endAngle - startAngle
  const startNormal = getUnitVectorFromAngle(startAngle)
  const endNormal = getUnitVectorFromAngle(endAngle)
  const startTangent = startNormal.getOrthogonal().times(Math.sign(angle))
  const endTangent = endNormal.getOrthogonal().times(-Math.sign(angle))
  // https://stackoverflow.com/questions/1734745/how-to-create-circle-with-b%C3%A9zier-curves
  const controlPointDistance = (4 / 3) * Math.tan(Math.abs(angle) / 4) * radius

  const p0 = center.plus(startNormal.times(radius))
  const p1 = p0.plus(startTangent.times(controlPointDistance))
  const p3 = center.plus(endNormal.times(radius))
  const p2 = p3.plus(endTangent.times(controlPointDistance))

  return new Curve(p0, p1, p2, p3)
}

function createTurn(
  footKey: FootKey,
  path: Path,
  turnClass: FootTurnConstructor,
  duration: number = CPathDuration,
): Sequence {
  const turn = new Sequence(path)
  turn.addKeyframe('time', new TimeKeyframe(duration, { pathCoordinate: path.length }))
  turn.addKeyframe(footKey, skatingFootInitialKeyframe)
  turn.addKeyframe(getOppositeFootKey(footKey), freeFootInitialKeyframe)
  turn.addFootTurn(footKey, new turnClass(turn.duration / 2, true, true))
  turn.addKeyframe(footKey, new FootKeyframe(turn.duration, skatingFootInitialOrFinalData))
  return turn
}

// Paths //////////////////////////////////////////////////////////////////////

const clockwiseCPath = new Path()

clockwiseCPath.addCurveEnd(
  getArcCurve(
    new Vector(pathRadius * CPathCenterShiftFactor, 0),
    pathRadius,
    (3 * Math.PI) / 2,
    Math.PI / 2,
  ),
)

const counterClockwiseCPath = new Path()

counterClockwiseCPath.addCurveEnd(
  getArcCurve(
    new Vector(-pathRadius * CPathCenterShiftFactor, 0),
    pathRadius,
    -Math.PI / 2,
    Math.PI / 2,
  ),
)

const clockwiseSPath = new Path()

clockwiseSPath.addCurveEnd(
  getArcCurve(new Vector(0, -pathRadius), pathRadius, (3 * Math.PI) / 2, Math.PI / 2),
)

clockwiseSPath.addCurveEnd(
  getArcCurve(new Vector(0, pathRadius), pathRadius, -Math.PI / 2, Math.PI / 2),
)

const counterClockwiseSPath = new Path()

counterClockwiseSPath.addCurveEnd(
  getArcCurve(new Vector(0, -pathRadius), pathRadius, -Math.PI / 2, Math.PI / 2),
)

counterClockwiseSPath.addCurveEnd(
  getArcCurve(new Vector(0, pathRadius), pathRadius, (3 * Math.PI) / 2, Math.PI / 2),
)

// 3-turns ////////////////////////////////////////////////////////////////////

export const LFI_3 = createTurn('footL', clockwiseCPath, ForwardClockwiseFootTurn)
export const LFO_3 = createTurn('footL', counterClockwiseCPath, ForwardCounterClockwiseFootTurn)
export const LBI_3 = createTurn('footL', clockwiseCPath, BackwardClockwiseFootTurn)
export const LBO_3 = createTurn('footL', counterClockwiseCPath, BackwardCounterClockwiseFootTurn)
export const RFI_3 = createTurn('footR', counterClockwiseCPath, ForwardCounterClockwiseFootTurn)
export const RFO_3 = createTurn('footR', clockwiseCPath, ForwardClockwiseFootTurn)
export const RBI_3 = createTurn('footR', counterClockwiseCPath, BackwardCounterClockwiseFootTurn)
export const RBO_3 = createTurn('footR', clockwiseCPath, BackwardClockwiseFootTurn)

// Brackets ///////////////////////////////////////////////////////////////////

export const LFI_B = createTurn('footL', clockwiseCPath, ForwardCounterClockwiseFootTurn)
export const LFO_B = createTurn('footL', counterClockwiseCPath, ForwardClockwiseFootTurn)
export const LBI_B = createTurn('footL', clockwiseCPath, BackwardCounterClockwiseFootTurn)
export const LBO_B = createTurn('footL', counterClockwiseCPath, BackwardClockwiseFootTurn)
export const RFI_B = createTurn('footR', counterClockwiseCPath, ForwardClockwiseFootTurn)
export const RFO_B = createTurn('footR', clockwiseCPath, ForwardCounterClockwiseFootTurn)
export const RBI_B = createTurn('footR', counterClockwiseCPath, BackwardClockwiseFootTurn)
export const RBO_B = createTurn('footR', clockwiseCPath, BackwardCounterClockwiseFootTurn)

// Rockers ////////////////////////////////////////////////////////////////////

export const LFI_RK = createTurn('footL', clockwiseSPath, ForwardClockwiseFootTurn, SPathDuration)
export const LFO_RK = createTurn(
  'footL',
  counterClockwiseSPath,
  ForwardCounterClockwiseFootTurn,
  SPathDuration,
)
export const LBI_RK = createTurn('footL', clockwiseSPath, BackwardClockwiseFootTurn, SPathDuration)
export const LBO_RK = createTurn(
  'footL',
  counterClockwiseSPath,
  BackwardCounterClockwiseFootTurn,
  SPathDuration,
)
export const RFI_RK = createTurn(
  'footR',
  counterClockwiseSPath,
  ForwardCounterClockwiseFootTurn,
  SPathDuration,
)
export const RFO_RK = createTurn('footR', clockwiseSPath, ForwardClockwiseFootTurn, SPathDuration)
export const RBI_RK = createTurn(
  'footR',
  counterClockwiseSPath,
  BackwardCounterClockwiseFootTurn,
  SPathDuration,
)
export const RBO_RK = createTurn('footR', clockwiseSPath, BackwardClockwiseFootTurn, SPathDuration)

// Counters ///////////////////////////////////////////////////////////////////

export const LFI_CTR = createTurn(
  'footL',
  clockwiseSPath,
  ForwardCounterClockwiseFootTurn,
  SPathDuration,
)
export const LFO_CTR = createTurn(
  'footL',
  counterClockwiseSPath,
  ForwardClockwiseFootTurn,
  SPathDuration,
)
export const LBI_CTR = createTurn(
  'footL',
  clockwiseSPath,
  BackwardCounterClockwiseFootTurn,
  SPathDuration,
)
export const LBO_CTR = createTurn(
  'footL',
  counterClockwiseSPath,
  BackwardClockwiseFootTurn,
  SPathDuration,
)
export const RFI_CTR = createTurn(
  'footR',
  counterClockwiseSPath,
  ForwardClockwiseFootTurn,
  SPathDuration,
)
export const RFO_CTR = createTurn(
  'footR',
  clockwiseSPath,
  ForwardCounterClockwiseFootTurn,
  SPathDuration,
)
export const RBI_CTR = createTurn(
  'footR',
  counterClockwiseSPath,
  BackwardClockwiseFootTurn,
  SPathDuration,
)
export const RBO_CTR = createTurn(
  'footR',
  clockwiseSPath,
  BackwardCounterClockwiseFootTurn,
  SPathDuration,
)

// Loops //////////////////////////////////////////////////////////////////////

export const LFI_Loop = createTurn('footL', clockwiseCPath, ForwardClockwiseFootLoop)
export const LFO_Loop = createTurn('footL', counterClockwiseCPath, ForwardCounterClockwiseFootLoop)
export const LBI_Loop = createTurn('footL', clockwiseCPath, BackwardClockwiseFootLoop)
export const LBO_Loop = createTurn('footL', counterClockwiseCPath, BackwardCounterClockwiseFootLoop)
export const RFI_Loop = createTurn('footR', counterClockwiseCPath, ForwardCounterClockwiseFootLoop)
export const RFO_Loop = createTurn('footR', clockwiseCPath, ForwardClockwiseFootLoop)
export const RBI_Loop = createTurn('footR', counterClockwiseCPath, BackwardCounterClockwiseFootLoop)
export const RBO_Loop = createTurn('footR', clockwiseCPath, BackwardClockwiseFootLoop)
