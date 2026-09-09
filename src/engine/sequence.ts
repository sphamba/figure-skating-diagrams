import { bladeLength } from "./constants.js";
import type { PathCoordinate, Time } from "./coordinates.js";
import type { Element } from "./element/element.js";
import { interpolate } from "./interpolate.js";
import { FootKeyframe, HipsKeyframe, TimeKeyframe, type FootData } from "./keyframe.js";
import type { FootKeyframeJSON, HipsKeyframeJSON, TimeKeyframeJSON } from "./keyframe.js";
import { Path } from "./path.js";
import { Quaternion, getQuaternionFromAngleAxis } from "./quaternion.js";
import type { CanvasRenderingContext2DSized } from "./rinkCanvas.js";
import { changeElementType } from "./element/turn.js";
import type { FootTurnJSON } from "./element/turn.js";
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

/** Keyframes an element contributes for each body part. */
type ElementKeyframes = {
  footL: FootKeyframe[];
  footR: FootKeyframe[];
  hips: HipsKeyframe[];
};
/** Part layers that elements can contribute keyframes to. */
type FootOrHipsKey = "footL" | "footR" | "hips";

/** JSON shape of a sequence, used for (de)serialization. */
export interface SequenceJSON {
  path: ReturnType<Path["toJSON"]>;
  keyframes: {
    footL: FootKeyframeJSON[];
    footR: FootKeyframeJSON[];
    hips: HipsKeyframeJSON[];
    time: TimeKeyframeJSON[];
  };
  elements: (FootTurnJSON | { type: string; start: number; end: number })[];
}

/** Relative coordinate between two keyframes, from 0 to 1 */
type Relative = number & { readonly __tag: unique symbol };

/** Path coordinate increment for drawing */
const drawIncrement = 0.02;
const traceWidth = 0.004;
const skidWidth = 0.03;
const defaultPathColor = "black";
const traceColorL = "rgb(48, 48, 210)";
const traceColorR = "rgb(156, 0, 0)";

export class Sequence {
  path: Path;
  keyframes: SequenceKeyframes;
  elements: Element[];

  /**
   * Keyframes each element currently contributes into the sequence's keyframe
   * arrays, keyed by element. Used to refresh a trace when an element's start
   * or end path coordinate changes.
   */
  private elementKeyframes = new WeakMap<Element, ElementKeyframes>();

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
    this.refreshElementKeyframes(element);
  }

  /**
   * Remove an element from the sequence. The keyframes it contributed to the
   * foot and hips parts are dropped too, so the timeline stays in sync.
   */
  removeElement(element: Element) {
    this.elements = this.elements.filter((candidate) => candidate !== element);
    const previous = this.elementKeyframes.get(element);
    if (previous) {
      this.removeElementKeyframes("footL", previous.footL);
      this.removeElementKeyframes("footR", previous.footR);
      this.removeElementKeyframes("hips", previous.hips);
    }
    this.elementKeyframes.delete(element);
  }

  /**
   * Replace one element with another in-place, keeping its position in the
   * array and rebuilding the keyframe contribution. The old element's
   * keyframes are dropped and the new element's are inserted.
   */
  replaceElement(oldElement: Element, newElement: Element) {
    const index = this.elements.indexOf(oldElement);
    if (index === -1) return;
    const previous = this.elementKeyframes.get(oldElement);
    if (previous) {
      this.removeElementKeyframes("footL", previous.footL);
      this.removeElementKeyframes("footR", previous.footR);
      this.removeElementKeyframes("hips", previous.hips);
    }
    this.elementKeyframes.delete(oldElement);
    this.elements[index] = newElement;
    this.refreshElementKeyframes(newElement);
  }

  /**
   * Recompute the keyframes an element contributes into the sequence's
   * keyframe arrays from the element's current start and end, replacing its
   * previous contribution. This is what keeps the blade traces in sync when an
   * element's start or end is edited.
   */
  updateElementKeyframes(element: Element) {
    const previous = this.elementKeyframes.get(element);
    if (previous) {
      this.removeElementKeyframes("footL", previous.footL);
      this.removeElementKeyframes("footR", previous.footR);
      this.removeElementKeyframes("hips", previous.hips);
    }
    this.refreshElementKeyframes(element);
  }

  /** Compute an element's keyframes, insert them and remember the contribution. */
  private refreshElementKeyframes(element: Element) {
    const footL = element.getLeftFootKeyframes();
    const footR = element.getRightFootKeyframes();
    const hips = element.getHipsKeyframes();
    for (const keyframe of footL) this.addKeyframe("footL", keyframe);
    for (const keyframe of footR) this.addKeyframe("footR", keyframe);
    for (const keyframe of hips) this.addKeyframe("hips", keyframe);
    this.elementKeyframes.set(element, { footL, footR, hips });
  }

  /** Remove a set of keyframe objects (by identity) from a part keyframe array. */
  private removeElementKeyframes<Key extends FootOrHipsKey>(partKey: Key, toRemove: KeyframeType[]) {
    const removeSet = new Set<KeyframeType>(toRemove);
    const arr = this.keyframes[partKey] as KeyframeType[];
    this.keyframes[partKey] = arr.filter((keyframe) => !removeSet.has(keyframe)) as SequenceKeyframes[Key];
  }

  /**
   * After deserialization the element contributions are rebuilt so they can be
   * refreshed later: baked keyframes matching a freshly computed element
   * keyframe are replaced by the fresh ones, which are then tracked per element.
   */
  private registerLoadedElementKeyframes(element: Element) {
    const fresh: ElementKeyframes = {
      footL: element.getLeftFootKeyframes(),
      footR: element.getRightFootKeyframes(),
      hips: element.getHipsKeyframes(),
    };
    this.removeMatchingKeyframes("footL", fresh.footL);
    this.removeMatchingKeyframes("footR", fresh.footR);
    this.removeMatchingKeyframes("hips", fresh.hips);
    for (const keyframe of fresh.footL) this.addKeyframe("footL", keyframe);
    for (const keyframe of fresh.footR) this.addKeyframe("footR", keyframe);
    for (const keyframe of fresh.hips) this.addKeyframe("hips", keyframe);
    this.elementKeyframes.set(element, fresh);
  }

  /** Drop baked keyframes that structure-equal any freshly computed element keyframe. */
  private removeMatchingKeyframes<Key extends FootOrHipsKey>(partKey: Key, computed: KeyframeType[]) {
    const computedJson = new Set(computed.map((keyframe) => JSON.stringify(keyframe.toJSON())));
    const arr = this.keyframes[partKey] as KeyframeType[];
    this.keyframes[partKey] = arr.filter(
      (keyframe) => !computedJson.has(JSON.stringify((keyframe as { toJSON(): unknown }).toJSON())),
    ) as SequenceKeyframes[Key];
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
    sequence.elements = json.elements.map((element) =>
      changeElementType(element.type, element as { type: string; start: number; end: number }),
    );
    for (const element of sequence.elements) {
      sequence.registerLoadedElementKeyframes(element);
    }
    return sequence;
  }

  /** Draw path and traces over a range of path coordinates. */
  draw(
    ctx: CanvasRenderingContext2DSized,
    pathWidth: number = traceWidth,
    uStart: PathCoordinate = 0 as PathCoordinate,
    uEnd?: PathCoordinate,
    pathColor: string = defaultPathColor,
    minTraceWidth?: number,
    minBladeLength?: number,
    minDrawIncrement?: number,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    this.drawPath(ctx, pathWidth, uStart, uEnd, pathColor);
    this.drawFootTraces(ctx, uStart, uEnd, minTraceWidth, minBladeLength, minDrawIncrement);
  }

  /** Draw only the foot traces (no path line), from the start to the end of
   * the path. Element scaling applies through minBladeLength. */
  drawTraces(
    ctx: CanvasRenderingContext2DSized,
    minTraceWidth?: number,
    minBladeLength?: number,
    minDrawIncrement?: number,
  ) {
    this.drawFootTraces(
      ctx,
      0 as PathCoordinate,
      this.path.length as PathCoordinate,
      minTraceWidth,
      minBladeLength,
      minDrawIncrement,
    );
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
    pathColor: string = defaultPathColor,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    ctx.strokeStyle = pathColor;
    ctx.lineWidth = pathWidth;
    this.path.draw(ctx, uStart, uEnd);
  }

  drawPathNodes(ctx: CanvasRenderingContext2DSized, nodeSize: number) {
    ctx.fillStyle = defaultPathColor;
    this.path.drawNodes(ctx, nodeSize);
  }

  drawFootTraces(
    ctx: CanvasRenderingContext2DSized,
    uStart: PathCoordinate = 0 as PathCoordinate,
    uEnd?: PathCoordinate,
    minTraceWidth?: number,
    minBladeLength?: number,
    minDrawIncrement?: number,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    this.drawFootTrace(ctx, "footL", uStart, uEnd, minTraceWidth, minBladeLength, minDrawIncrement);
    this.drawFootTrace(ctx, "footR", uStart, uEnd, minTraceWidth, minBladeLength, minDrawIncrement);
  }

  /**
   * The blade length in metres used to trace the feet: the real blade length,
   * or the given minimum when it is larger.
   */
  private getDrawBladeLength(minBladeLength?: number): number {
    return minBladeLength === undefined ? bladeLength : Math.max(bladeLength, minBladeLength);
  }

  /** Scale factor between the drawn blade and the real blade. */
  getBladeLengthScale(minBladeLength?: number): number {
    return this.getDrawBladeLength(minBladeLength) / bladeLength;
  }

  /**
   * Foot keyframes used for drawing. When a blade length scale is active, the
   * keyframes each element contributes are fetched with their coordinates
   * re-based onto the element's scaled span: the trace then renders as if the
   * elements really spanned the scaled range. The stored keyframes of the
   * sequence are not touched.
   */
  getDrawFootKeyframes(footKey: FootKey, scale: number): FootKeyframe[] {
    if (scale === 1) {
      return this.keyframes[footKey];
    }
    const keyframes: FootKeyframe[] = [];
    for (const element of this.elements) {
      keyframes.push(
        ...(footKey === "footL" ? element.getLeftFootKeyframes(scale) : element.getRightFootKeyframes(scale)),
      );
    }
    keyframes.sort((a, b) => a.coordinate - b.coordinate);
    return keyframes;
  }

  drawFootTrace(
    ctx: CanvasRenderingContext2DSized,
    footKey: FootKey,
    uStart: PathCoordinate = 0 as PathCoordinate,
    uEnd?: PathCoordinate,
    minTraceWidth?: number,
    minBladeLength?: number,
    minDrawIncrement?: number,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    if (this.keyframes[footKey].length == 0) {
      return;
    }
    // A foot trace needs the foot's position, orientation and contact point at
    // every point along the path. If the keyframes do not define all three,
    // there is nothing meaningful to trace, so skip it. (Production timelines
    // always define all three, so this only affects freshly built or partial
    // timelines, e.g. a sequence with no elements.)
    const hasData = (property: keyof FootData) =>
      this.keyframes[footKey].some((keyframe) => keyframe.data[property] !== undefined);
    if (!hasData("position") || !hasData("orientation") || !hasData("contactPoint")) {
      return;
    }

    let previousContactPosition: Vector<2> | undefined;
    const drawBladeLength = this.getDrawBladeLength(minBladeLength);
    // When the blade is scaled, the keyframes are fetched with their
    // coordinates re-based onto the scaled element spans, so the trace follows
    // the moved element ends.
    const drawKeyframes =
      minBladeLength === undefined
        ? undefined
        : this.getDrawFootKeyframes(footKey, this.getBladeLengthScale(minBladeLength));

    // Path coordinate step between drawn points: the default 0.02 m, or a
    // larger minimum given by the caller so each drawn segment never advances
    // less than one screen pixel when zoomed out.
    const step = Math.max(drawIncrement, minDrawIncrement ?? 0);
    for (
      let pathCoordinate = uStart;
      pathCoordinate <= uEnd;
      pathCoordinate = (pathCoordinate + step) as PathCoordinate
    ) {
      const contactPoint = this.getInterpolatedValue(footKey, "contactPoint", pathCoordinate, drawKeyframes) as number;
      const footRelativeOrientation = this.getInterpolatedValue(
        footKey,
        "orientation",
        pathCoordinate,
        drawKeyframes,
      ) as Quaternion;
      const pathOrientation = this.getPathOrientation(pathCoordinate);
      const pathPosition = this.path.getPosition(pathCoordinate);
      const footRelativePosition = this.getInterpolatedValue(
        footKey,
        "position",
        pathCoordinate,
        drawKeyframes,
      ) as Vector<3>;

      let footRelativeDirection = new Vector<3>(1, 0, 0);
      footRelativeDirection = footRelativeDirection.rotate(footRelativeOrientation);

      let contactRelativePosition = footRelativePosition.copy();
      contactRelativePosition.x += (contactPoint - 0.5) * drawBladeLength;

      const footOrientation = footRelativeOrientation.times(pathOrientation);
      contactRelativePosition = contactRelativePosition.rotate(footOrientation);
      const contactPosition = pathPosition.plus(contactRelativePosition as unknown as Vector<2>);
      const footDirection = footRelativeDirection.rotate(pathOrientation);

      if (previousContactPosition === undefined) {
        previousContactPosition = contactPosition;
        continue;
      }

      const onGround = contactRelativePosition.z <= 0;
      if (!onGround) {
        // The foot is off the ice: no trace is drawn for it.
        previousContactPosition = contactPosition;
        continue;
      }
      if (footKey == "footL") {
        ctx.strokeStyle = traceColorL;
      } else {
        ctx.strokeStyle = traceColorR;
      }
      const lineWidth = getTraceWidth(
        footDirection,
        contactPosition.minus(previousContactPosition),
        traceWidth,
        skidWidth,
      );
      ctx.lineWidth = minTraceWidth === undefined ? lineWidth : Math.max(lineWidth, minTraceWidth);

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
  >(
    partKey: Key,
    property: Property,
    coordinate: KeyframeType["coordinate"],
    keyframes: KeyframeType[] = this.keyframes[partKey] as KeyframeType[],
  ): [KeyframeType, KeyframeType, Relative] {
    let list = keyframes;
    let filtered = list.filter((keyframe) => keyframe.data[property as keyof typeof keyframe.data] !== undefined);
    // When a custom (e.g. scale-aware) list has no keyframe for this property,
    // fall back to the stored part keyframes so interpolation still works.
    if (filtered.length === 0 && list !== this.keyframes[partKey]) {
      list = this.keyframes[partKey] as KeyframeType[];
      filtered = list.filter((keyframe) => keyframe.data[property as keyof typeof keyframe.data] !== undefined);
      if (filtered.length === 0) {
        // Nothing anywhere carries this property; callers guard beforehand.
        throw new Error(`No keyframe data for property: ${String(property)}`);
      }
    }

    let keyframeAfter = filtered.find((keyframe) => keyframe.coordinate > coordinate);
    if (keyframeAfter === undefined) {
      keyframeAfter = filtered[filtered.length - 1]!;
    }

    const keyframeAfterIndex = filtered.indexOf(keyframeAfter);
    const keyframeBeforeIndex = Math.max(0, keyframeAfterIndex - 1);
    const keyframeBefore = filtered[keyframeBeforeIndex]!;

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
  >(
    partKey: Key,
    property: Property,
    coordinate: KeyframeType["coordinate"],
    keyframes?: KeyframeType[],
  ): Interpolable {
    const [keyframeBefore, keyframeAfter, easedCoordinate] = this.getKeyframesAround(
      partKey,
      property,
      coordinate,
      keyframes,
    );
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
