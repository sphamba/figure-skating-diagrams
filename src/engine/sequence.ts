import { bladeLength, maxBladeLength } from "./constants.js";
import type { PathCoordinate, Time } from "./coordinates.js";
import type { AxisRect } from "./curve.js";
import type { Element } from "./element/element.js";
import { interpolate } from "./interpolate.js";
import { FootKeyframe, HipsKeyframe, TimeKeyframe, type FootData } from "./keyframe.js";
import type { FootKeyframeJSON, HipsKeyframeJSON, TimeKeyframeJSON } from "./keyframe.js";
import { Path } from "./path.js";
import { Quaternion, getQuaternionFromAngleAxis } from "./quaternion.js";
import type { CanvasRenderingContext2DSized } from "./rinkCanvas.js";
import { changeElementType } from "./element/turnTypes.js";
import { computeSpanScales } from "./element/spanScaling.js";
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

type ElementKeyframes = {
  footL: FootKeyframe[];
  footR: FootKeyframe[];
  hips: HipsKeyframe[];
};
type FootOrHipsKey = "footL" | "footR" | "hips";

export interface SequenceJSON {
  name?: string;
  traceColorL?: string;
  traceColorR?: string;
  path: ReturnType<Path["toJSON"]>;
  keyframes: {
    footL: FootKeyframeJSON[];
    footR: FootKeyframeJSON[];
    hips: HipsKeyframeJSON[];
    time: TimeKeyframeJSON[];
  };
  elements: (FootTurnJSON | { type: string; start: number; end: number })[];
}

type Relative = number & { readonly __tag: unique symbol };

const drawIncrement = 0.02; // path coordinate increment for drawing traces, in meters
const traceWidth = 0.004;
const skidWidth = 0.03;
const defaultPathColor = "black";
const defaultTraceColorL = "#3030d2";
const defaultTraceColorR = "#9c0000";
const traceOpacityForward = 0.7;

const boundaryDelta = 0.001; // m gap kept between consecutive element keyframes

function boundaryCoordinates(
  end: number,
  start: number,
  endElementIsZeroSize: boolean,
  startElementIsZeroSize: boolean,
): [number, number] {
  if (start - end >= boundaryDelta) return [end, start];
  if (endElementIsZeroSize && startElementIsZeroSize) return [end, start];
  if (endElementIsZeroSize) return [end, end + boundaryDelta];
  if (startElementIsZeroSize) return [Math.min(end, start), start];
  const middle = (end + start) / 2;
  return [middle, middle + boundaryDelta];
}

export class Sequence {
  name: string = "Sequence";
  traceColorL: string = defaultTraceColorL;
  traceColorR: string = defaultTraceColorR;
  path: Path;
  keyframes: SequenceKeyframes;
  elements: Element[];

  private elementKeyframes = new WeakMap<Element, ElementKeyframes>();

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

  updateElementKeyframes(element: Element) {
    const previous = this.elementKeyframes.get(element);
    if (previous) {
      this.removeElementKeyframes("footL", previous.footL);
      this.removeElementKeyframes("footR", previous.footR);
      this.removeElementKeyframes("hips", previous.hips);
    }
    this.refreshElementKeyframes(element);
  }

  private refreshElementKeyframes(element: Element) {
    const footL = element.getLeftFootKeyframes();
    const footR = element.getRightFootKeyframes();
    const hips = element.getHipsKeyframes();
    for (const keyframe of footL) this.addKeyframe("footL", keyframe);
    for (const keyframe of footR) this.addKeyframe("footR", keyframe);
    for (const keyframe of hips) this.addKeyframe("hips", keyframe);
    this.elementKeyframes.set(element, { footL, footR, hips });
    this.constrainElementKeyframes();
  }

  private constrainElementKeyframes() {
    const elements = [...this.elements].sort((a, b) => (a.start as number) - (b.start as number));
    for (const part of ["footL", "footR", "hips"] as const) {
      for (let index = 0; index < elements.length - 1; index++) {
        const endElement = elements[index];
        const startElement = elements[index + 1];
        if (!endElement || !startElement) continue;
        const endKeyframes = this.elementKeyframes.get(endElement)?.[part];
        const startKeyframes = this.elementKeyframes.get(startElement)?.[part];
        if (!endKeyframes?.length || !startKeyframes?.length) continue;
        const endKeyframe = endKeyframes[endKeyframes.length - 1];
        const startKeyframe = startKeyframes[0];
        if (!endKeyframe || !startKeyframe) continue;
        const [end, start] = boundaryCoordinates(
          endKeyframe.coordinate,
          startKeyframe.coordinate,
          endElement.start === endElement.end,
          startElement.start === startElement.end,
        );
        endKeyframe.coordinate = end as PathCoordinate;
        startKeyframe.coordinate = start as PathCoordinate;
      }
    }
    this.keyframes.footL.sort((a, b) => a.coordinate - b.coordinate);
    this.keyframes.footR.sort((a, b) => a.coordinate - b.coordinate);
    this.keyframes.hips.sort((a, b) => a.coordinate - b.coordinate);
  }

  private removeElementKeyframes<Key extends FootOrHipsKey>(partKey: Key, toRemove: KeyframeType[]) {
    const removeSet = new Set<KeyframeType>(toRemove);
    const arr = this.keyframes[partKey] as KeyframeType[];
    this.keyframes[partKey] = arr.filter((keyframe) => !removeSet.has(keyframe)) as SequenceKeyframes[Key];
  }

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
    this.constrainElementKeyframes();
  }

  private removeMatchingKeyframes<Key extends FootOrHipsKey>(partKey: Key, computed: KeyframeType[]) {
    const computedJson = new Set(computed.map((keyframe) => JSON.stringify(keyframe.toJSON())));
    const arr = this.keyframes[partKey] as KeyframeType[];
    this.keyframes[partKey] = arr.filter(
      (keyframe) => !computedJson.has(JSON.stringify((keyframe as { toJSON(): unknown }).toJSON())),
    ) as SequenceKeyframes[Key];
  }

  toJSON(): SequenceJSON {
    return {
      name: this.name,
      traceColorL: this.traceColorL,
      traceColorR: this.traceColorR,
      path: this.path.toJSON(),
      keyframes: {
        footL: [],
        footR: [],
        hips: [],
        time: this.keyframes.time.map((keyframe) => keyframe.toJSON()),
      },
      elements: this.elements.map((element) => element.toJSON() as FootTurnJSON),
    };
  }

  static fromJSON(json: SequenceJSON): Sequence {
    const sequence = new Sequence(Path.fromJSON(json.path));
    sequence.name = json.name ?? "Sequence";
    sequence.traceColorL = json.traceColorL ?? defaultTraceColorL;
    sequence.traceColorR = json.traceColorR ?? defaultTraceColorR;
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

  draw(
    ctx: CanvasRenderingContext2DSized,
    pathWidth: number = traceWidth,
    uStart: PathCoordinate = 0 as PathCoordinate,
    uEnd?: PathCoordinate,
    pathColor: string = defaultPathColor,
    minTraceWidth?: number,
    minBladeLength?: number,
    minDrawIncrement?: number,
    viewport?: AxisRect,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    this.drawPath(ctx, pathWidth, uStart, uEnd, pathColor);
    this.drawFootTraces(ctx, uStart, uEnd, minTraceWidth, minBladeLength, minDrawIncrement, viewport);
  }

  drawTraces(
    ctx: CanvasRenderingContext2DSized,
    minTraceWidth?: number,
    minBladeLength?: number,
    minDrawIncrement?: number,
    viewport?: AxisRect,
  ) {
    this.drawFootTraces(
      ctx,
      0 as PathCoordinate,
      this.path.length as PathCoordinate,
      minTraceWidth,
      minBladeLength,
      minDrawIncrement,
      viewport,
    );
  }

  getPathCoordinateFromTime(time: Time): PathCoordinate {
    return this.getInterpolatedValue("time", "pathCoordinate", time);
  }

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
    viewport?: AxisRect,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    this.drawFootTrace(ctx, "footL", uStart, uEnd, minTraceWidth, minBladeLength, minDrawIncrement, viewport);
    this.drawFootTrace(ctx, "footR", uStart, uEnd, minTraceWidth, minBladeLength, minDrawIncrement, viewport);
  }

  private getDrawBladeLength(minBladeLength?: number): number {
    if (minBladeLength === undefined) return bladeLength;
    return Math.min(maxBladeLength, Math.max(bladeLength, minBladeLength));
  }

  getBladeLengthScale(minBladeLength?: number): number {
    return this.getDrawBladeLength(minBladeLength) / bladeLength;
  }

  getSpanScales(minBladeLength?: number): Map<Element, number> {
    const target = this.getBladeLengthScale(minBladeLength);
    if (target === 1) return new Map();
    return computeSpanScales(this.elements, target, this.path.length);
  }

  getDrawFootKeyframes(footKey: FootKey, scale: number): FootKeyframe[] {
    if (scale === 1) {
      return this.keyframes[footKey];
    }
    const elements = [...this.elements].sort((a, b) => (a.start as number) - (b.start as number));
    const keyframes: FootKeyframe[] = [];
    let endElement: Element | undefined;
    let endKeyframes: FootKeyframe[] | undefined;
    const scales = scale === 1 ? undefined : computeSpanScales(this.elements, scale, this.path.length);
    for (const element of elements) {
      const elementScale = scales ? scales.get(element) : undefined;
      const startKeyframes =
        footKey === "footL"
          ? element.getLeftFootKeyframes(elementScale, scale)
          : element.getRightFootKeyframes(elementScale, scale);
      const endKeyframe = endKeyframes?.[endKeyframes.length - 1];
      const startKeyframe = startKeyframes[0];
      if (endKeyframe && startKeyframe && endElement) {
        const [end, start] = boundaryCoordinates(
          endKeyframe.coordinate,
          startKeyframe.coordinate,
          endElement.start === endElement.end,
          element.start === element.end,
        );
        endKeyframe.coordinate = end as PathCoordinate;
        startKeyframe.coordinate = start as PathCoordinate;
      }
      keyframes.push(...startKeyframes);
      endElement = element;
      endKeyframes = startKeyframes;
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
    viewport?: AxisRect,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    if (this.keyframes[footKey].length == 0) {
      return;
    }
    const hasData = (property: keyof FootData) =>
      this.keyframes[footKey].some((keyframe) => keyframe.data[property] !== undefined);
    if (!hasData("position") || !hasData("orientation") || !hasData("contactPoint")) {
      return;
    }

    let previousContactPosition: Vector<2> | undefined;
    let backwardSegmentCount = 0;
    const drawBladeLength = this.getDrawBladeLength(minBladeLength);
    const drawKeyframes =
      minBladeLength === undefined
        ? undefined
        : this.getDrawFootKeyframes(footKey, this.getBladeLengthScale(minBladeLength));

    const step = Math.max(drawIncrement, minDrawIncrement ?? 0);
    const visibleRanges = this.getVisibleTraceRanges(uStart, uEnd, viewport, minBladeLength);
    let previousRangeEnd: number | undefined;
    for (const [rangeStart, rangeEnd] of visibleRanges) {
      if (previousRangeEnd !== undefined && Math.abs(rangeStart - previousRangeEnd) > 1e-9) {
        previousContactPosition = undefined;
      }
      previousRangeEnd = rangeEnd;
      for (
        let pathCoordinate = rangeStart;
        pathCoordinate <= rangeEnd;
        pathCoordinate = (pathCoordinate + step) as PathCoordinate
      ) {
        const contactPoint = this.getInterpolatedValue(
          footKey,
          "contactPoint",
          pathCoordinate,
          drawKeyframes,
        ) as number;
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
          previousContactPosition = contactPosition;
          continue;
        }
        if (footKey == "footL") {
          ctx.strokeStyle = this.traceColorL;
        } else {
          ctx.strokeStyle = this.traceColorR;
        }
        const traceIncrement = contactPosition.minus(previousContactPosition);
        const { width: lineWidth, alignment } = getTraceWidth(footDirection, traceIncrement, traceWidth, skidWidth);
        const backward = alignment < 0;
        if (backward) {
          backwardSegmentCount++;
          if (backwardSegmentCount % 2 === 0) {
            previousContactPosition = contactPosition;
            continue;
          }
        } else {
          backwardSegmentCount = 0;
        }

        ctx.lineWidth = minTraceWidth === undefined ? lineWidth : Math.max(lineWidth, minTraceWidth);

        const previousAlpha = ctx.globalAlpha;
        ctx.globalAlpha = backward ? previousAlpha : previousAlpha * traceOpacityForward;

        ctx.beginPath();
        ctx.moveTo(previousContactPosition.x, -previousContactPosition.y);
        ctx.lineTo(contactPosition.x, -contactPosition.y);
        ctx.stroke();

        ctx.globalAlpha = previousAlpha;

        previousContactPosition = contactPosition;
      }
    }
  }

  private getVisibleTraceRanges(
    uStart: PathCoordinate,
    uEnd: PathCoordinate,
    viewport: AxisRect | undefined,
    minBladeLength?: number,
  ): Array<[PathCoordinate, PathCoordinate]> {
    const curves = this.path.curves;
    if (!viewport || curves.length === 0) {
      return [[uStart, uEnd]];
    }
    const margin = this.getDrawBladeLength(minBladeLength);
    const ranges: Array<[PathCoordinate, PathCoordinate]> = [];
    let curveStart = 0;
    for (const curve of curves) {
      const curveEnd = curveStart + curve.length;
      if (curveEnd >= uStart && curveStart <= uEnd) {
        if (curve.intersectsRect(viewport, margin)) {
          const start = Math.max(uStart as number, curveStart);
          const end = Math.min(uEnd as number, curveEnd);
          if (end >= start) {
            ranges.push([start as PathCoordinate, end as PathCoordinate]);
          }
        }
      }
      curveStart = curveEnd;
    }
    return ranges;
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
    if (filtered.length === 0 && list !== this.keyframes[partKey]) {
      list = this.keyframes[partKey] as KeyframeType[];
      filtered = list.filter((keyframe) => keyframe.data[property as keyof typeof keyframe.data] !== undefined);
      if (filtered.length === 0) {
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
): { width: number; alignment: number } {
  const footDirection2d = new Vector<2>(foodDirection.x, foodDirection.y);
  const alignment = traceIncrement.normalized().dot(footDirection2d);
  const s = alignment ** 2;
  return { width: s * traceWidth + (1 - s) * skidWidth, alignment };
}

export function getOppositeFootKey(footKey: FootKey): FootKey {
  return footKey === "footL" ? "footR" : "footL";
}
