import { bladeLength } from "./constants.js";
import type { PathCoordinate, Time } from "./coordinates.js";
import type { Element } from "./element.js";
import { interpolate } from "./interpolate.js";
import { FootKeyframe, HipsKeyframe, TimeKeyframe } from "./keyframe.js";
import type { FootKeyframeJSON, HipsKeyframeJSON, TimeKeyframeJSON } from "./keyframe.js";
import { Path } from "./path.js";
import { Quaternion, getQuaternionFromAngleAxis } from "./quaternion.js";
import type { CanvasRenderingContext2DSized } from "./rinkCanvas.js";
import { FootTurn } from "./turn.js";
import type { FootTurnJSON } from "./turn.js";
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

/** JSON shape of a sequence, used for (de)serialization. */
export interface SequenceJSON {
  path: ReturnType<Path["toJSON"]>;
  keyframes: {
    footL: FootKeyframeJSON[];
    footR: FootKeyframeJSON[];
    hips: HipsKeyframeJSON[];
    time: TimeKeyframeJSON[];
  };
  elements: FootTurnJSON[];
}

/** Relative coordinate between two keyframes, from 0 to 1 */
type Relative = number & { readonly __tag: unique symbol };

/** Path coordinate increment for drawing */
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
  elements: Element[];

  /**
   * A sequence is a 2D path with no time. Time is a separate clock layer.
   *
   * Body part keyframes (foot and hips) sit on the path coordinate axis u.
   * The time keyframes form the clock: they map time t to the path
   * coordinate u, so any path point can be given a time.
   */
  constructor(path: Path) {
    this.path = path;
    this.keyframes = {
      footL: [],
      footR: [],
      hips: [],
      time: [new TimeKeyframe(0 as Time, { pathCoordinate: 0 as PathCoordinate })],
    };
    this.elements = [];
  }

  get duration(): Time {
    return this.keyframes.time[this.keyframes.time.length - 1]!.coordinate;
  }

  addKeyframe<Key extends PartKey, KeyframeType extends SequenceKeyframes[Key][number]>(
    partKey: Key,
    keyframe: KeyframeType,
  ) {
    const keyframes = this.keyframes[partKey] as KeyframeType[];
    keyframes.push(keyframe);
    keyframes.sort((a, b) => a.coordinate - b.coordinate);
  }

  addElement(element: Element) {
    this.elements.push(element);

    for (const keyframe of element.getLeftFootKeyframes()) {
      this.addKeyframe("footL", keyframe);
    }
    for (const keyframe of element.getRightFootKeyframes()) {
      this.addKeyframe("footR", keyframe);
    }
    for (const keyframe of element.getHipsKeyframes()) {
      this.addKeyframe("hips", keyframe);
    }
  }

  /** Serialize this sequence to a plain JSON object. */
  toJSON(): SequenceJSON {
    return {
      path: this.path.toJSON(),
      keyframes: {
        footL: this.keyframes.footL.map((keyframe) => keyframe.toJSON()),
        footR: this.keyframes.footR.map((keyframe) => keyframe.toJSON()),
        hips: this.keyframes.hips.map((keyframe) => keyframe.toJSON()),
        time: this.keyframes.time.map((keyframe) => keyframe.toJSON()),
      },
      elements: this.elements.map((element) => element.toJSON() as FootTurnJSON),
    };
  }

  /** Reconstruct a sequence from serialized data, delegating to each class. */
  static fromJSON(json: SequenceJSON): Sequence {
    const sequence = new Sequence(Path.fromJSON(json.path));
    sequence.keyframes = {
      footL: json.keyframes.footL.map((keyframe) => FootKeyframe.fromJSON(keyframe)),
      footR: json.keyframes.footR.map((keyframe) => FootKeyframe.fromJSON(keyframe)),
      hips: json.keyframes.hips.map((keyframe) => HipsKeyframe.fromJSON(keyframe)),
      time: json.keyframes.time.map((keyframe) => TimeKeyframe.fromJSON(keyframe)),
    };
    sequence.elements = json.elements.map((element) => FootTurn.fromJSON(element));
    return sequence;
  }

  /** Draw path and traces over a range of path coordinates. */
  draw(
    ctx: CanvasRenderingContext2DSized,
    pathWidth: number = traceWidth,
    uStart: PathCoordinate = 0 as PathCoordinate,
    uEnd?: PathCoordinate,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    this.drawPath(ctx, pathWidth, uStart, uEnd);
    this.drawFootTraces(ctx, uStart, uEnd);
  }

  /**
   * Get the path coordinate u at a given time t using the clock.
   * @param time - Time in seconds.
   */
  getPathCoordinateFromTime(time: Time): PathCoordinate {
    return this.getInterpolatedValue("time", "pathCoordinate", time);
  }

  /**
   * Get the time t at a given path coordinate u using the clock.
   * This is the inverse of the time keyframes.
   * @param pathCoordinate - Uniform path coordinate u.
   */
  getTimeFromPathCoordinate(pathCoordinate: PathCoordinate): Time {
    const timeKeyframes = this.keyframes.time;
    if (timeKeyframes.length === 0) {
      return 0 as Time;
    }

    const first = timeKeyframes[0]!;
    if (pathCoordinate <= first.data.pathCoordinate) {
      return first.coordinate;
    }

    const last = timeKeyframes[timeKeyframes.length - 1]!;
    if (pathCoordinate >= last.data.pathCoordinate) {
      return last.coordinate;
    }

    for (let i = 0; i < timeKeyframes.length - 1; i++) {
      const before = timeKeyframes[i]!;
      const after = timeKeyframes[i + 1]!;
      const uBefore = before.data.pathCoordinate;
      const uAfter = after.data.pathCoordinate;
      if (uBefore === uAfter) {
        continue;
      }
      if (pathCoordinate >= uBefore && pathCoordinate <= uAfter) {
        const s = (pathCoordinate - uBefore) / (uAfter - uBefore);
        return (before.coordinate + s * (after.coordinate - before.coordinate)) as Time;
      }
    }

    return last.coordinate;
  }

  drawPath(
    ctx: CanvasRenderingContext2DSized,
    pathWidth: number = traceWidth,
    uStart: PathCoordinate = 0 as PathCoordinate,
    uEnd?: PathCoordinate,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    ctx.strokeStyle = pathColor;
    ctx.lineWidth = pathWidth;
    this.path.draw(ctx, uStart, uEnd);
  }

  drawPathNodes(ctx: CanvasRenderingContext2DSized, nodeSize: number) {
    ctx.fillStyle = pathColor;
    this.path.drawNodes(ctx, nodeSize);
  }

  drawFootTraces(
    ctx: CanvasRenderingContext2DSized,
    uStart: PathCoordinate = 0 as PathCoordinate,
    uEnd?: PathCoordinate,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    this.drawFootTrace(ctx, "footL", uStart, uEnd);
    this.drawFootTrace(ctx, "footR", uStart, uEnd);
  }

  drawFootTrace(
    ctx: CanvasRenderingContext2DSized,
    footKey: FootKey,
    uStart: PathCoordinate = 0 as PathCoordinate,
    uEnd?: PathCoordinate,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    if (this.keyframes[footKey].length == 0) {
      return;
    }

    let previousContactPosition: Vector<2> | undefined;

    for (
      let pathCoordinate = uStart;
      pathCoordinate <= uEnd;
      pathCoordinate = (pathCoordinate + drawIncrement) as PathCoordinate
    ) {
      const footRelativePosition = this.getInterpolatedValue(footKey, "position", pathCoordinate) as Vector<3>;
      const contactPoint = this.getInterpolatedValue(footKey, "contactPoint", pathCoordinate) as number;
      const footRelativeOrientation = this.getInterpolatedValue(footKey, "orientation", pathCoordinate) as Quaternion;
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

  getPathDirection(pathCoordinate: PathCoordinate): Vector<3> {
    const pathDirection2D = this.path.getDerivative(pathCoordinate).normalized();
    return new Vector<3>(pathDirection2D.x, pathDirection2D.y, 0);
  }

  getPathOrientation(pathCoordinate: PathCoordinate): Quaternion {
    const pathDerivative = this.path.getDerivative(pathCoordinate);
    const pathAngle = Math.atan2(pathDerivative.y, pathDerivative.x);
    return getQuaternionFromAngleAxis(pathAngle);
  }

  getKeyframesAround<
    Key extends PartKey,
    KeyframeType extends SequenceKeyframes[Key][number],
    Property extends keyof KeyframeType["data"],
  >(partKey: Key, property: Property, coordinate: KeyframeType["coordinate"]): [KeyframeType, KeyframeType, Relative] {
    let keyframes = this.keyframes[partKey] as KeyframeType[];
    keyframes = keyframes.filter((keyframe) => keyframe.data[property as keyof typeof keyframe.data] !== undefined);

    let keyframeAfter = keyframes.find((keyframe) => keyframe.coordinate > coordinate);
    if (keyframeAfter === undefined) {
      keyframeAfter = keyframes[keyframes.length - 1]!;
    }

    const keyframeAfterIndex = keyframes.indexOf(keyframeAfter);
    const keyframeBeforeIndex = Math.max(0, keyframeAfterIndex - 1);
    const keyframeBefore = keyframes[keyframeBeforeIndex]!;

    let relativeCoordinate =
      (coordinate - keyframeBefore.coordinate) / (keyframeAfter.coordinate - keyframeBefore.coordinate);
    relativeCoordinate = Math.max(0, Math.min(1, relativeCoordinate));

    const easedCoordinate = getEasedTime(keyframeBefore, keyframeAfter, relativeCoordinate as Relative);

    return [keyframeBefore, keyframeAfter, easedCoordinate];
  }

  getInterpolatedValue<
    Key extends PartKey,
    KeyframeType extends SequenceKeyframes[Key][number],
    Property extends keyof KeyframeType["data"],
    Interpolable extends KeyframeType["data"][Property],
  >(partKey: Key, property: Property, coordinate: KeyframeType["coordinate"]): Interpolable {
    const [keyframeBefore, keyframeAfter, easedCoordinate] = this.getKeyframesAround(partKey, property, coordinate);
    const beforeValue = keyframeBefore.data[property as keyof typeof keyframeBefore.data];
    const afterValue = keyframeAfter.data[property as keyof typeof keyframeAfter.data];
    return interpolate(beforeValue, afterValue, easedCoordinate) as Interpolable;
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
