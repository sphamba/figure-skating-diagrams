import { bladeLength } from "./constants.js";
import { interpolate } from "./interpolate.js";
import { FootKeyframe, HipsKeyframe, TimeKeyframe } from "./keyframe.js";
import type { Path } from "./path.js";
import { Quaternion, getQuaternionFromAngleAxis } from "./quaternion.js";
import { FootTurn } from "./turn.js";
import type { CanvasRenderingContext2DSized } from "./rinkCanvas.js";
import { Vector } from "./vector.js";

type SequenceKeyframes = {
  footL: FootKeyframe[];
  footR: FootKeyframe[];
  hips: HipsKeyframe[];
  time: TimeKeyframe[];
};
type PartKey = keyof SequenceKeyframes;
export type FootKey = "footL" | "footR";
type KeyframeType = SequenceKeyframes[PartKey][number];

/** Relative coordinate between two keyframes, from 0 to 1 */
type Relative = number & { readonly __tag: unique symbol };

/** Time increment for drawing */
const drawIncrement = 0.02;
const traceWidth = 0.004;
const skidWidth = 0.03;
const pathColor = "black";
const traceColorL = "rgb(48, 48, 210)";
const hoverColorL = "rgba(48, 48, 210, 0.2)";
const traceColorR = "rgb(156, 0, 0)";
const hoverColorR = "rgba(156, 0, 0, 0.2)";

export class Sequence {
  path: Path;
  keyframes: SequenceKeyframes;
  footTurns: {
    footL: FootTurn[];
    footR: FootTurn[];
  };

  /** Timed path and keyframes for the position of all body parts */
  constructor(path: Path) {
    this.path = path;
    this.keyframes = {
      footL: [],
      footR: [],
      hips: [],
      time: [new TimeKeyframe(0, { pathCoordinate: 0 })],
    };
    this.footTurns = {
      footL: [],
      footR: [],
    };
  }

  get duration(): number {
    return this.keyframes.time[this.keyframes.time.length - 1].time;
  }

  addKeyframe<Key extends PartKey, KeyframeType extends SequenceKeyframes[Key][number]>(
    partKey: Key,
    keyframe: KeyframeType,
  ) {
    const keyframes = this.keyframes[partKey] as KeyframeType[];
    keyframes.push(keyframe);
    keyframes.sort((a, b) => a.time - b.time);
  }

  addFootTurn(footKey: FootKey, turn: FootTurn) {
    turn.createKeyframes(this);
    this.footTurns[footKey].push(turn);

    for (const keyframe of turn.keyframes) {
      this.addKeyframe(footKey, keyframe);
    }
  }

  /** Draw path and traces */
  draw(ctx: CanvasRenderingContext2DSized, pathWidth: number = traceWidth, timeStart: number = 0, timeEnd?: number) {
    timeEnd ??= this.duration;

    this.drawPath(ctx, pathWidth, timeStart, timeEnd);
    this.drawFootTraces(ctx, timeStart, timeEnd);
  }

  getPathCoordinateFromTime(time: number): number {
    return this.getInterpolatedValue("time", "pathCoordinate", time);
  }

  getTimeFromPathCoordinate(pathCoordinate: number): number {
    return pathCoordinate; // TODO: Implement
  }

  drawPath(
    ctx: CanvasRenderingContext2DSized,
    pathWidth: number = traceWidth,
    timeStart: number = 0,
    timeEnd?: number,
  ) {
    timeEnd ??= this.duration;
    const pathCoordinateStart = this.getPathCoordinateFromTime(timeStart);
    const pathCoordinateEnd = this.getPathCoordinateFromTime(timeEnd);

    ctx.strokeStyle = pathColor;
    ctx.lineWidth = pathWidth;
    this.path.draw(ctx, pathCoordinateStart, pathCoordinateEnd);
  }

  drawPathNodes(ctx: CanvasRenderingContext2DSized, nodeSize: number) {
    ctx.fillStyle = pathColor;
    this.path.drawNodes(ctx, nodeSize);
  }

  drawFootTraces(ctx: CanvasRenderingContext2DSized, timeStart: number = 0, timeEnd?: number) {
    timeEnd ??= this.duration;

    this.drawFootTrace(ctx, "footL", timeStart, timeEnd);
    this.drawFootTrace(ctx, "footR", timeStart, timeEnd);
  }

  drawFootTrace(ctx: CanvasRenderingContext2DSized, footKey: FootKey, timeStart: number = 0, timeEnd?: number) {
    timeEnd ??= this.duration;

    if (this.keyframes[footKey].length == 0) {
      return;
    }

    let previousContactPosition: Vector<2> | undefined;

    for (let time = timeStart; time <= timeEnd; time += drawIncrement) {
      const footRelativePosition = this.getInterpolatedValue(footKey, "position", time) as Vector<3>;
      const contactPoint = this.getInterpolatedValue(footKey, "contactPoint", time) as number;
      const footRelativeOrientation = this.getInterpolatedValue(footKey, "orientation", time) as Quaternion;
      const pathCoordinate = this.getPathCoordinateFromTime(time);
      const pathOrientation = this.getPathOrientation(pathCoordinate);
      const pathPosition = this.path.getPosition(pathCoordinate);

      let footRelativeDirection = new Vector<3>(1, 0, 0);
      footRelativeDirection = footRelativeDirection.rotate(footRelativeOrientation);

      let contactRelativePosition = footRelativePosition.copy();
      contactRelativePosition.x += (contactPoint - 0.5) * bladeLength;

      const footOrientation = footRelativeOrientation.times(pathOrientation);
      contactRelativePosition = contactRelativePosition.rotate(footOrientation);
      const contactPosition = pathPosition.plus(contactRelativePosition as unknown as Vector<2>);
      const footDirection = footRelativeDirection.rotate(pathOrientation);

      if (previousContactPosition === undefined) {
        previousContactPosition = contactPosition;
        continue;
      }

      const onGround = contactRelativePosition.z <= 0;
      if (footKey == "footL") {
        ctx.strokeStyle = onGround ? traceColorL : hoverColorL;
      } else {
        ctx.strokeStyle = onGround ? traceColorR : hoverColorR;
      }
      ctx.lineWidth = onGround
        ? getTraceWidth(footDirection, contactPosition.minus(previousContactPosition), traceWidth, skidWidth)
        : traceWidth;

      ctx.beginPath();
      ctx.moveTo(previousContactPosition.x, -previousContactPosition.y);
      ctx.lineTo(contactPosition.x, -contactPosition.y);
      ctx.stroke();

      previousContactPosition = contactPosition;
    }
  }

  getPathDirection(pathCoordinate: number): Vector<3> {
    const pathDirection2D = this.path.getDerivative(pathCoordinate).normalized();
    return new Vector<3>(pathDirection2D.x, pathDirection2D.y, 0);
  }

  getPathOrientation(pathCoordinate: number): Quaternion {
    const pathDerivative = this.path.getDerivative(pathCoordinate);
    const pathAngle = Math.atan2(pathDerivative.y, pathDerivative.x);
    return getQuaternionFromAngleAxis(pathAngle);
  }

  getKeyframesAround<
    Key extends PartKey,
    KeyframeType extends SequenceKeyframes[Key][number],
    Property extends keyof KeyframeType["data"],
  >(partKey: Key, property: Property, time: number): [KeyframeType, KeyframeType, Relative] {
    let keyframes = this.keyframes[partKey] as KeyframeType[];
    keyframes = keyframes.filter((keyframe) => keyframe.data[property as keyof typeof keyframe.data] !== undefined);

    let keyframeAfter = keyframes.find((keyframe) => keyframe.time > time);
    if (keyframeAfter === undefined) {
      keyframeAfter = keyframes[keyframes.length - 1];
    }

    const keyframeAfterIndex = keyframes.indexOf(keyframeAfter);
    const keyframeBeforeIndex = Math.max(0, keyframeAfterIndex - 1);
    const keyframeBefore = keyframes[keyframeBeforeIndex];

    let relativeTime = (time - keyframeBefore.time) / (keyframeAfter.time - keyframeBefore.time);
    relativeTime = Math.max(0, Math.min(1, relativeTime));

    const easedTime = getEasedTime(keyframeBefore, keyframeAfter, relativeTime as Relative);

    return [keyframeBefore, keyframeAfter, easedTime];
  }

  getInterpolatedValue<
    Key extends PartKey,
    KeyframeType extends SequenceKeyframes[Key][number],
    Property extends keyof KeyframeType["data"],
    Interpolable extends KeyframeType["data"][Property],
  >(partKey: Key, property: Property, time: number): Interpolable {
    const [keyframeBefore, keyframeAfter, easedTime] = this.getKeyframesAround(partKey, property, time);
    const beforeValue = keyframeBefore.data[property as keyof typeof keyframeBefore.data];
    const afterValue = keyframeAfter.data[property as keyof typeof keyframeAfter.data];
    return interpolate(beforeValue, afterValue, easedTime) as Interpolable;
  }
}

function getEasedTime<T extends KeyframeType>(
  keyframeBefore: T,
  keyframeAfter: T,
  relativeCoordinate: Relative,
): Relative {
  const transitionStart = keyframeBefore.transitionOut;
  const transitionEnd = keyframeAfter.transitionIn;
  const s = relativeCoordinate;
  let easedCoordinate: Relative;

  if (transitionStart === "linear" && transitionEnd === "linear") {
    easedCoordinate = s;
  } else if (transitionStart === "smooth" && transitionEnd === "linear") {
    easedCoordinate = (s ** 2) as Relative;
  } else if (transitionStart === "linear" && transitionEnd === "smooth") {
    easedCoordinate = (-(s ** 2) + 2 * s) as Relative;
  } else if (transitionStart === "smooth" && transitionEnd === "smooth") {
    easedCoordinate = (-2 * s ** 3 + 3 * s ** 2) as Relative;
  } else {
    throw new Error(`Keyframe transition from "${transitionStart}" to "${transitionEnd}" not implemented`);
  }

  return easedCoordinate;
}

function getTraceWidth(
  foodDirection: Vector<3>,
  traceIncrement: Vector<2>,
  traceWidth: number,
  skidWidth: number,
): number {
  const footDirection2d = new Vector<2>(foodDirection.x, foodDirection.y);
  const alignment = traceIncrement.normalized().dot(footDirection2d);
  const s = alignment ** 2;
  return s * traceWidth + (1 - s) * skidWidth;
}

export function getOppositeFootKey(footKey: FootKey): FootKey {
  return footKey === "footL" ? "footR" : "footL";
}
