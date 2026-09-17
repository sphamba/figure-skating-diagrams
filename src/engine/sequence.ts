import { Annotation, type AnnotationJSON } from "./annotation.js";
import { bladeLength, maxBladeLength } from "./constants.js";
import type { PathCoordinate, Time } from "./coordinates.js";
import type { AxisRect } from "./curve.js";
import type { Element } from "./element/element.js";
import { interpolate, type Interpolable, type Interpolable as Interpolatable } from "./interpolate.js";
import { FootKeyframe, HipsKeyframe, TimingKeyframe, type FootData } from "./keyframe.js";
import type { FootKeyframeJSON, HipsKeyframeJSON, TimeKeyframeJSON, TimingKeyframeJSON } from "./keyframe.js";
import type { Transition } from "./keyframe.js";
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
  time: TimingKeyframe[];
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
    time: TimingKeyframeJSON[];
  };
  elements: (FootTurnJSON | { type: string; start: number; end: number })[];
  annotations?: AnnotationJSON[];
}

type Relative = number & { readonly __tag: unique symbol };

const drawIncrement = 0.02; // path coordinate increment for drawing traces, in meters
export const traceWidth = 0.004;
const skidWidth = 0.03;
const markSize = 0.03; // m cross diameter of toe-pick marks
const defaultPathColor = "black";
const defaultTraceColorL = "#3030d2";
const defaultTraceColorR = "#9c0000";
const traceOpacityForward = 0.7;

export const DEFAULT_BPM = 120;

const boundaryDelta = 0.001; // m gap kept between consecutive element keyframes

// Subdivide a drawn trace segment until its length is at most 1.5 x the target step.
const segmentThreshold = 1.5;
const MAX_SEGMENT_DEPTH = 10; // depth guard; each cut halves the path coordinate interval

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
  annotations: Annotation[] = [];

  private elementKeyframes = new WeakMap<Element, ElementKeyframes>();

  // Version counters invalidate the pure-function caches below. Any edit that
  // mutates time keyframes bumps timeVersion; any edit that touches the
  // element set or their generated keyframes bumps elementVersion.
  private timeVersion = 1;
  private elementVersion = 1;
  private timeCache: {
    bpm: number;
    version: number;
    keys: TimingKeyframe[];
    resolved: Array<{ keyframe: TimingKeyframe; time: number }>;
  } | null = null;
  private spanScalesCache: { scale: number; pathLength: number; version: number; scales: Map<Element, number> } | null =
    null;
  // Single slot per foot: the scale changes with every zoom step, so a
  // per-scale key map would accumulate an entry per zoom level.
  private drawnKeyframesCache = new Map<
    FootKey,
    { scale: number; pathLength: number; version: number; keyframes: FootKeyframe[] }
  >();
  // Sampled trace geometry per foot. Stride 8:
  // [uEnd, x0, y0, x1, y1, rawWidth, alphaFactor, 0], in exact doubles. The
  // coordinates are in path axes: the canvas y-negation happens once at draw
  // time in strokeTraceSegments.
  private traceCache = new Map<FootKey, { key: string; segments: Float64Array }>();

  invalidateTimeCaches(): void {
    this.timeVersion++;
  }

  // Trace segment cache, keyed on Path.generation, elementVersion and the
  // bucketed zoom-dependent draw parameters, so explicit invalidation hooks
  // are not needed for correctness.
  invalidateTraceCaches(): void {
    this.traceCache.clear();
  }

  constructor(path: Path) {
    this.path = path;
    this.keyframes = {
      footL: [],
      footR: [],
      hips: [],
      time: [new TimingKeyframe(0 as PathCoordinate, "time", 0)],
    };
    this.elements = [];
  }

  getDuration(bpm: number = DEFAULT_BPM): Time {
    const resolved = this.resolveTimes(bpm);
    if (resolved.length === 0) {
      return 0 as Time;
    }
    return resolved[resolved.length - 1]!.time as Time;
  }

  addKeyframe<Key extends PartKey, KeyframeType extends SequenceKeyframes[Key][number]>(
    partKey: Key,
    keyframe: KeyframeType,
  ) {
    if (partKey === "time") {
      this.timeVersion++;
    }
    const keyframes = this.keyframes[partKey] as KeyframeType[];
    keyframes.push(keyframe);
    keyframes.sort((a, b) => a.coordinate - b.coordinate);
  }

  addElement(element: Element) {
    this.elements.push(element);
    this.refreshElementKeyframes(element);
  }

  addAnnotation(annotation: Annotation) {
    this.annotations.push(annotation);
    this.annotations.sort((a, b) => (a.start as number) - (b.start as number));
  }

  removeAnnotation(annotation: Annotation) {
    this.annotations = this.annotations.filter((candidate) => candidate !== annotation);
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
    this.elementVersion++;
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
    this.elementVersion++;
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
    this.elementVersion++;
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
      annotations: this.annotations.map((annotation) => annotation.toJSON()),
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
      time: (json.keyframes.time ?? []).map((entry) => {
        if ((entry as { data?: { type?: string } }).data?.type === undefined) {
          const legacy = entry as unknown as TimeKeyframeJSON;
          return new TimingKeyframe(legacy.data.pathCoordinate as PathCoordinate, "time", legacy.coordinate);
        }
        return TimingKeyframe.fromJSON(entry as TimingKeyframeJSON);
      }),
    };
    sequence.elements = json.elements.map((element) =>
      changeElementType(element.type, element as { type: string; start: number; end: number }),
    );
    for (const element of sequence.elements) {
      sequence.registerLoadedElementKeyframes(element);
    }
    sequence.annotations = (json.annotations ?? []).map((annotation) => Annotation.fromJSON(annotation));
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
    minMarkSize?: number,
    minDrawIncrement?: number,
    viewport?: AxisRect,
    skipTraceCache?: boolean,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    this.drawPath(ctx, pathWidth, uStart, uEnd, pathColor);
    this.drawFootTraces(
      ctx,
      uStart,
      uEnd,
      minTraceWidth,
      minBladeLength,
      minMarkSize,
      minDrawIncrement,
      viewport,
      skipTraceCache,
    );
  }

  drawTraces(
    ctx: CanvasRenderingContext2DSized,
    minTraceWidth?: number,
    minBladeLength?: number,
    minMarkSize?: number,
    minDrawIncrement?: number,
    viewport?: AxisRect,
    skipTraceCache?: boolean,
  ) {
    this.drawFootTraces(
      ctx,
      0 as PathCoordinate,
      this.path.length as PathCoordinate,
      minTraceWidth,
      minBladeLength,
      minMarkSize,
      minDrawIncrement,
      viewport,
      skipTraceCache,
    );
  }

  resolveTimes(bpm: number = DEFAULT_BPM): Array<{ keyframe: TimingKeyframe; time: number }> {
    // resolveTimes is a pure function of the time keyframes and bpm. The cache
    // keeps the draw loop free of repeated copies and sorts; in-place edits of
    // a member keyframe bump timeVersion through invalidateTimeCaches.
    const time = this.keyframes.time;
    const cached = this.timeCache;
    if (
      cached &&
      cached.bpm === bpm &&
      cached.version === this.timeVersion &&
      cached.keys.length === time.length &&
      cached.keys.every((keyframe, index) => keyframe === time[index])
    ) {
      return cached.resolved;
    }
    const resolved = this.computeResolvedTimes(bpm);
    this.timeCache = { bpm, version: this.timeVersion, keys: [...time], resolved };
    return resolved;
  }

  private computeResolvedTimes(bpm: number): Array<{ keyframe: TimingKeyframe; time: number }> {
    const keyframes = [...this.keyframes.time].sort((a, b) => a.pathCoordinate - b.pathCoordinate);
    const resolved: Array<{ keyframe: TimingKeyframe; time: number }> = [];
    let previousTime = 0;
    for (const keyframe of keyframes) {
      const time = keyframe.kind === "beats" ? previousTime + (keyframe.value * 60) / bpm : keyframe.value;
      resolved.push({ keyframe, time });
      previousTime = time;
    }
    return resolved;
  }

  getPathCoordinateFromTime(time: Time, bpm: number = DEFAULT_BPM): PathCoordinate {
    const resolved = this.resolveTimes(bpm);
    if (resolved.length === 0) {
      return 0 as PathCoordinate;
    }

    const first = resolved[0]!;
    if (time <= first.time) {
      return first.keyframe.pathCoordinate;
    }

    const last = resolved[resolved.length - 1]!;
    if (time >= last.time) {
      return last.keyframe.pathCoordinate;
    }

    for (let i = 0; i + 1 < resolved.length; i++) {
      const before = resolved[i]!;
      const after = resolved[i + 1]!;
      if (after.time === before.time) {
        continue;
      }
      if (time >= before.time && time <= after.time) {
        const s = (time - before.time) / (after.time - before.time);
        const eased = getEasedTime(before.keyframe, after.keyframe, s);
        return interpolate(before.keyframe.pathCoordinate, after.keyframe.pathCoordinate, eased) as PathCoordinate;
      }
    }

    return last.keyframe.pathCoordinate;
  }

  getTimeFromPathCoordinate(pathCoordinate: PathCoordinate, bpm: number = DEFAULT_BPM): Time {
    const resolved = this.resolveTimes(bpm);
    if (resolved.length === 0) {
      return 0 as Time;
    }

    const first = resolved[0]!;
    if (pathCoordinate <= first.keyframe.pathCoordinate) {
      return first.time as Time;
    }

    const last = resolved[resolved.length - 1]!;
    if (pathCoordinate >= last.keyframe.pathCoordinate) {
      return last.time as Time;
    }

    for (let i = 0; i + 1 < resolved.length; i++) {
      const before = resolved[i]!;
      const after = resolved[i + 1]!;
      const uBefore = before.keyframe.pathCoordinate;
      const uAfter = after.keyframe.pathCoordinate;
      if (uBefore === uAfter) {
        continue;
      }
      if (pathCoordinate >= uBefore && pathCoordinate <= uAfter) {
        const s = (pathCoordinate - uBefore) / (uAfter - uBefore);
        return (before.time + s * (after.time - before.time)) as Time;
      }
    }

    return last.time as Time;
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
    minMarkSize?: number,
    minDrawIncrement?: number,
    viewport?: AxisRect,
    skipTraceCache?: boolean,
  ) {
    uEnd ??= this.path.length as PathCoordinate;

    this.drawFootTrace(
      ctx,
      "footL",
      uStart,
      uEnd,
      minTraceWidth,
      minBladeLength,
      minMarkSize,
      minDrawIncrement,
      viewport,
      skipTraceCache,
    );
    this.drawFootTrace(
      ctx,
      "footR",
      uStart,
      uEnd,
      minTraceWidth,
      minBladeLength,
      minMarkSize,
      minDrawIncrement,
      viewport,
      skipTraceCache,
    );
  }

  private getDrawBladeLength(minBladeLength?: number): number {
    if (minBladeLength === undefined) return bladeLength;
    return Math.min(maxBladeLength, Math.max(bladeLength, minBladeLength));
  }

  private getMarkSize(minMarkSize?: number, minBladeLength?: number): number {
    let size = Math.max(markSize, minMarkSize ?? markSize);
    if (minBladeLength !== undefined && minMarkSize !== undefined) {
      size = Math.min(size, maxBladeLength * (minMarkSize / minBladeLength));
    }
    return size;
  }

  getBladeLengthScale(minBladeLength?: number): number {
    return this.getDrawBladeLength(minBladeLength) / bladeLength;
  }

  getSpanScales(minBladeLength?: number): Map<Element, number> {
    const target = this.getBladeLengthScale(minBladeLength);
    const cached = this.spanScalesCache;
    if (
      cached &&
      cached.scale === target &&
      cached.pathLength === this.path.length &&
      cached.version === this.elementVersion
    ) {
      return cached.scales;
    }
    const scales = target === 1 ? new Map() : computeSpanScales(this.elements, target, this.path.length);
    this.spanScalesCache = { scale: target, pathLength: this.path.length, version: this.elementVersion, scales };
    return scales;
  }

  getDrawFootKeyframes(footKey: FootKey, scale: number): FootKeyframe[] {
    if (scale === 1) {
      return this.keyframes[footKey];
    }
    const cached = this.drawnKeyframesCache.get(footKey);
    if (
      cached &&
      cached.scale === scale &&
      cached.pathLength === this.path.length &&
      cached.version === this.elementVersion
    ) {
      return cached.keyframes;
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
    this.drawnKeyframesCache.set(footKey, {
      scale,
      pathLength: this.path.length,
      version: this.elementVersion,
      keyframes,
    });
    return keyframes;
  }

  drawFootTrace(
    ctx: CanvasRenderingContext2DSized,
    footKey: FootKey,
    uStart: PathCoordinate = 0 as PathCoordinate,
    uEnd?: PathCoordinate,
    minTraceWidth?: number,
    minBladeLength?: number,
    minMarkSize?: number,
    minDrawIncrement?: number,
    viewport?: AxisRect,
    skipTraceCache?: boolean,
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

    const drawBladeLength = this.getDrawBladeLength(minBladeLength);
    const drawKeyframes =
      minBladeLength === undefined
        ? undefined
        : this.getDrawFootKeyframes(footKey, this.getBladeLengthScale(minBladeLength));

    const step = Math.max(drawIncrement, minDrawIncrement ?? 0);
    const visibleRanges = this.getVisibleTraceRanges(uStart, uEnd, viewport, minBladeLength);
    const drawable = drawKeyframes ?? this.keyframes[footKey];

    let segments: Float64Array;
    if (skipTraceCache) {
      // An edit frame: rebuild only the visible range, without touching the cache.
      segments = this.buildTraceSegments(footKey, drawBladeLength, step, visibleRanges, drawable);
    } else {
      segments = this.getTraceSegments(footKey, drawBladeLength, step, drawable);
    }
    this.strokeTraceSegments(ctx, footKey, uStart, uEnd, minTraceWidth, viewport, minBladeLength, segments);

    const toePickSamples = this.getSampledKeyframes(
      drawable.filter(
        (keyframe) => keyframe.data.toePick === true && keyframe.coordinate >= uStart && keyframe.coordinate <= uEnd,
      ),
      visibleRanges,
      step,
    );
    const spinSamples = this.getSampledKeyframes(
      drawable.filter(
        (keyframe) =>
          keyframe.data.spins !== undefined &&
          keyframe.data.spins !== 0 &&
          keyframe.coordinate >= uStart &&
          keyframe.coordinate <= uEnd,
      ),
      visibleRanges,
      step,
    );
    const toePickKeyframes = new Set<FootKeyframe>();
    const spinKeyframes = new Set<FootKeyframe>();

    for (const [rangeStart, rangeEnd] of visibleRanges) {
      for (
        let pathCoordinate = rangeStart;
        pathCoordinate <= rangeEnd;
        pathCoordinate = (pathCoordinate + step) as PathCoordinate
      ) {
        const samples = toePickSamples.get(pathCoordinate as number);
        if (samples) {
          for (const keyframe of samples) toePickKeyframes.add(keyframe);
        }
        const spinMatches = spinSamples.get(pathCoordinate as number);
        if (spinMatches) {
          for (const keyframe of spinMatches) spinKeyframes.add(keyframe);
        }
      }
    }

    for (const keyframe of toePickKeyframes) {
      const data = keyframe.data;
      if (data.position === undefined || data.orientation === undefined || data.contactPoint === undefined) continue;
      const pathOrientation = this.getPathOrientation(keyframe.coordinate);
      const pathPosition = this.path.getPosition(keyframe.coordinate);
      let contactRelativePosition = data.position.copy();
      contactRelativePosition.x += (data.contactPoint - 0.5) * drawBladeLength;
      const footOrientation = data.orientation.times(pathOrientation);
      contactRelativePosition = contactRelativePosition.rotate(footOrientation);
      const contactPosition = pathPosition.plus(contactRelativePosition as unknown as Vector<2>);
      const half = this.getMarkSize(minMarkSize, minBladeLength) / 2;
      const dx = half / Math.SQRT2;
      ctx.strokeStyle = footKey === "footL" ? this.traceColorL : this.traceColorR;
      ctx.lineWidth = minTraceWidth === undefined ? traceWidth : Math.max(traceWidth, minTraceWidth);
      ctx.beginPath();
      ctx.moveTo(contactPosition.x - dx, -(contactPosition.y - dx));
      ctx.lineTo(contactPosition.x + dx, -(contactPosition.y + dx));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(contactPosition.x - dx, -(contactPosition.y + dx));
      ctx.lineTo(contactPosition.x + dx, -(contactPosition.y - dx));
      ctx.stroke();
    }

    for (const keyframe of spinKeyframes) {
      const data = keyframe.data;
      if (data.orientation === undefined || data.spinShift === undefined || data.spinShift === 0) continue;
      // The circles sit at the path frame lateral offset "spinShift" of the
      // centerline, so each one touches the centerline. A single circle sits at the
      // element middle. Several circles span the element from start to end, with the
      // element span taken from the neighbor keyframes in "drawable": the spin
      // element places rest keyframes at its start and end. The foot orientation is
      // not applied: the shift direction is set by the spin handedness.
      const radius = Math.abs(data.spinShift);
      const count = Math.abs(data.spins ?? 0);
      const circleCoordinates: PathCoordinate[] = [];
      if (count <= 1) {
        circleCoordinates.push(keyframe.coordinate);
      } else {
        const index = drawable.indexOf(keyframe);
        const spanStart = (drawable[index - 1] ?? keyframe).coordinate as number;
        const spanEnd = (drawable[index + 1] ?? keyframe).coordinate as number;
        for (let i = 0; i < count; i++) {
          circleCoordinates.push((spanStart + ((spanEnd - spanStart) * (i + 0.5)) / count) as PathCoordinate);
        }
      }
      ctx.strokeStyle = footKey === "footL" ? this.traceColorL : this.traceColorR;
      ctx.lineWidth = minTraceWidth === undefined ? traceWidth : Math.max(traceWidth, minTraceWidth);
      // A backwards foot uses a dashed line: dash length "step", space "step",
      // where "step" is the real-length draw increment of the current zoom level.
      const backwards = getRelativeForwardDirection(data.orientation).x < 0;
      ctx.setLineDash(backwards ? [step, step] : []);
      for (const coordinate of circleCoordinates) {
        const pathOrientation = this.getPathOrientation(coordinate);
        const center = this.path
          .getPosition(coordinate)
          .plus(new Vector<3>(0, data.spinShift, 0).rotate(pathOrientation) as unknown as Vector<2>);
        ctx.beginPath();
        ctx.arc(center.x, -center.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  // Sampled trace geometry for the whole path in path coordinates. The
  // sampling loop and per-segment stroke attributes are a pure function of
  // (path LUTs, foot keyframes, step, blade length), so the polyline is built
  // once and replayed under the current transform.
  private buildTraceSegments(
    footKey: FootKey,
    drawBladeLength: number,
    step: number,
    visibleRanges: Array<[PathCoordinate, PathCoordinate]>,
    drawable: FootKeyframe[],
  ): Float64Array {
    const records: number[] = [];
    let previousContactPosition: Vector<2> | undefined;
    let previousU: PathCoordinate | undefined;
    let backwardSegmentCount = 0;
    const defaultKeyframes = this.keyframes[footKey];
    const hasFallback = drawable !== defaultKeyframes;
    const byProperty = (list: FootKeyframe[], property: keyof FootData) =>
      list.filter((keyframe) => keyframe.data[property] !== undefined);
    const filteredContact = byProperty(drawable, "contactPoint");
    const filteredOrientation = byProperty(drawable, "orientation");
    const filteredPosition = byProperty(drawable, "position");
    const fallbackContact = hasFallback ? byProperty(defaultKeyframes, "contactPoint") : undefined;
    const fallbackOrientation = hasFallback ? byProperty(defaultKeyframes, "orientation") : undefined;
    const fallbackPosition = hasFallback ? byProperty(defaultKeyframes, "position") : undefined;
    const interpolateProperty = (property: keyof FootData, coordinate: number) => {
      const filtered =
        property === "contactPoint"
          ? filteredContact
          : property === "orientation"
            ? filteredOrientation
            : filteredPosition;
      const fallback =
        property === "contactPoint"
          ? fallbackContact
          : property === "orientation"
            ? fallbackOrientation
            : fallbackPosition;
      return this.getInterpolatedValueInFilteredList(property, coordinate, filtered, fallback) as number;
    };

    const maxSquaredSegmentLength = segmentThreshold ** 2 * step * step;

    const computeContactData = (pathCoordinate: PathCoordinate) => {
      const contactPoint = interpolateProperty("contactPoint", pathCoordinate);
      const footRelativeOrientation = interpolateProperty("orientation", pathCoordinate) as unknown as Quaternion;
      const pathOrientation = this.getPathOrientation(pathCoordinate);
      const pathPosition = this.path.getPosition(pathCoordinate);
      const footRelativePosition = interpolateProperty("position", pathCoordinate) as unknown as Vector<3>;

      const footRelativeDirection = getRelativeForwardDirection(footRelativeOrientation);

      let contactRelativePosition = footRelativePosition.copy();
      contactRelativePosition.x += (contactPoint - 0.5) * drawBladeLength;
      contactRelativePosition = contactRelativePosition.rotate(
        footRelativeOrientation.times(pathOrientation),
      ) as Vector<3>;

      const contactPosition = pathPosition.plus(contactRelativePosition as unknown as Vector<2>);
      const footDirection = footRelativeDirection.rotate(pathOrientation);
      return { contactPosition, footDirection, onGround: contactRelativePosition.z <= 0 };
    };

    const emitSegment = (
      uPrev: PathCoordinate,
      uCur: PathCoordinate,
      pPrev: Vector<2>,
      pCur: Vector<2>,
      footDirectionCur: Vector<3>,
      onGroundCur: boolean,
      depth: number,
    ) => {
      const traceIncrement = pCur.minus(pPrev as Vector<2>);
      if (depth > 0 && traceIncrement.lengthSquared() > maxSquaredSegmentLength) {
        const uMid = ((uPrev + uCur) / 2) as PathCoordinate;
        const midData = computeContactData(uMid);
        emitSegment(
          uPrev,
          uMid,
          pPrev,
          midData.contactPosition as Vector<2>,
          midData.footDirection,
          midData.onGround,
          depth - 1,
        );
        emitSegment(uMid, uCur, midData.contactPosition as Vector<2>, pCur, footDirectionCur, onGroundCur, depth - 1);
        return;
      }

      if (!onGroundCur) return;

      const { width: lineWidth, alignment } = getTraceWidth(footDirectionCur, traceIncrement, traceWidth, skidWidth);
      const backward = alignment < 0;
      if (backward) {
        backwardSegmentCount++;
        if (backwardSegmentCount % 2 === 0) return;
      } else {
        backwardSegmentCount = 0;
      }

      records.push(uCur, pPrev.x, pPrev.y, pCur.x, pCur.y, lineWidth, backward ? 1 : traceOpacityForward, 0);
    };

    let previousRangeEnd: number | undefined;
    for (const [rangeStart, rangeEnd] of visibleRanges) {
      if (previousRangeEnd !== undefined && Math.abs(rangeStart - previousRangeEnd) > 1e-9) {
        previousContactPosition = undefined;
        previousU = undefined;
      }
      previousRangeEnd = rangeEnd;
      for (
        let pathCoordinate = rangeStart;
        pathCoordinate <= rangeEnd;
        pathCoordinate = (pathCoordinate + step) as PathCoordinate
      ) {
        const data = computeContactData(pathCoordinate);

        if (previousContactPosition === undefined) {
          previousContactPosition = data.contactPosition;
          previousU = pathCoordinate;
          continue;
        }

        if (!data.onGround) {
          previousContactPosition = data.contactPosition;
          previousU = pathCoordinate;
          continue;
        }

        emitSegment(
          previousU!,
          pathCoordinate,
          previousContactPosition,
          data.contactPosition,
          data.footDirection,
          true,
          MAX_SEGMENT_DEPTH,
        );

        previousContactPosition = data.contactPosition;
        previousU = pathCoordinate;
      }
    }
    return Float64Array.from(records);
  }

  private getTraceSegments(
    footKey: FootKey,
    drawBladeLength: number,
    step: number,
    drawable: FootKeyframe[],
  ): Float64Array {
    // Relative ~4% buckets (1/16 octave): the same zoom level maps to the same
    // bucket, and a nearby level reuses the cached geometry instead of
    // rebuilding it on every wheel or pinch step.
    const stepBucket = Math.round(Math.log2(step) * 16) / 16;
    const bladeBucket = Math.round(Math.log2(drawBladeLength) * 16) / 16;
    const key = `${this.path.generation}:${this.elementVersion}:${stepBucket}:${bladeBucket}`;
    const cached = this.traceCache.get(footKey);
    if (cached && cached.key === key) {
      return cached.segments;
    }
    const segments = this.buildTraceSegments(footKey, drawBladeLength, step, this.fullTraceRanges(), drawable);
    this.traceCache.set(footKey, { key, segments });
    return segments;
  }

  // Per-curve ranges over the whole path: the sample grid restarts at every
  // curve boundary, so a cached build matches the directly drawn grid.
  private fullTraceRanges(): Array<[PathCoordinate, PathCoordinate]> {
    const curves = this.path.curves;
    if (curves.length === 0) {
      return [[0 as PathCoordinate, this.path.length as PathCoordinate]];
    }
    const ranges: Array<[PathCoordinate, PathCoordinate]> = [];
    let curveStart = 0;
    for (const curve of curves) {
      const curveEnd = curveStart + curve.length;
      if (curveEnd > curveStart && curveEnd <= this.path.length) {
        ranges.push([curveStart as PathCoordinate, curveEnd as PathCoordinate]);
      }
      curveStart = curveEnd;
    }
    if (ranges.length === 0) {
      ranges.push([0 as PathCoordinate, this.path.length as PathCoordinate]);
    }
    return ranges;
  }

  private strokeTraceSegments(
    ctx: CanvasRenderingContext2DSized,
    footKey: FootKey,
    uStart: PathCoordinate,
    uEnd: PathCoordinate,
    minTraceWidth: number | undefined,
    viewport: AxisRect | undefined,
    minBladeLength: number | undefined,
    segments: Float64Array,
  ) {
    const curves = this.path.curves;
    const margin = this.getDrawBladeLength(minBladeLength);
    const visible = viewport === undefined ? undefined : curves.map((curve) => curve.intersectsRect(viewport, margin));
    let curveIndex = 0;
    let curveEnd = curves.length > 0 ? curves[0]!.length : Number.POSITIVE_INFINITY;
    ctx.strokeStyle = footKey === "footL" ? this.traceColorL : this.traceColorR;
    const entryAlpha = ctx.globalAlpha;
    for (let index = 0; index + 7 < segments.length; index += 8) {
      // The endpoint decides visibility and range: a segment spanning a curve
      // boundary or a draw-range edge belongs to the destination curve of the
      // directly drawn sample grid, so it hides with that curve.
      const segmentEnd = segments[index]!;
      while (curveIndex < curves.length - 1 && segmentEnd >= curveEnd) {
        curveIndex++;
        curveEnd += curves[curveIndex]!.length;
      }
      if (segmentEnd < (uStart as number) || segmentEnd > (uEnd as number)) continue;
      if (visible !== undefined && !visible[curveIndex]) continue;
      const lineWidth = segments[index + 5]!;
      ctx.lineWidth = minTraceWidth === undefined ? lineWidth : Math.max(lineWidth, minTraceWidth);
      ctx.globalAlpha = entryAlpha * segments[index + 6]!;
      ctx.beginPath();
      ctx.moveTo(segments[index + 1]!, -segments[index + 2]!);
      ctx.lineTo(segments[index + 3]!, -segments[index + 4]!);
      ctx.stroke();
    }
    ctx.globalAlpha = entryAlpha;
  }

  private getSampledKeyframes(
    marked: FootKeyframe[],
    visibleRanges: Array<[PathCoordinate, PathCoordinate]>,
    step: number,
  ): Map<number, FootKeyframe[]> {
    const keyframesBySample = new Map<number, FootKeyframe[]>();
    for (const keyframe of marked) {
      const u = keyframe.coordinate as number;
      for (const [rangeStart, rangeEnd] of visibleRanges) {
        if (u < rangeStart || u > rangeEnd) continue;
        // Replicate the sampling accumulation below so the lookup keys match the drawn samples.
        let nearest: number | undefined;
        for (let sample = rangeStart as number; sample <= rangeEnd; sample += step) {
          if (nearest === undefined || Math.abs(u - sample) < Math.abs(u - nearest)) nearest = sample;
        }
        if (nearest === undefined || Math.abs(nearest - u) > step / 2) continue;
        const samples = keyframesBySample.get(nearest) ?? [];
        samples.push(keyframe);
        keyframesBySample.set(nearest, samples);
        break;
      }
    }
    return keyframesBySample;
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

  getWorldForwardDirection(partKey: FootOrHipsKey, pathCoordinate: PathCoordinate): Vector<3> {
    const orientation = this.getInterpolatedValue(partKey, "orientation", pathCoordinate) as Quaternion;
    return getRelativeForwardDirection(orientation).rotate(this.getPathOrientation(pathCoordinate));
  }

  getFloorAngle(partKey: FootOrHipsKey, pathCoordinate: PathCoordinate): number {
    return getFloorAngleFromDirection(this.getWorldForwardDirection(partKey, pathCoordinate));
  }

  getFloorAngleFromPath(pathCoordinate: PathCoordinate): number {
    return getFloorAngleFromDirection(this.getPathDirection(pathCoordinate));
  }

  getKeyframesAround<
    Key extends FootOrHipsKey,
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

    // Coincident keyframes (also a single keyframe at the exact coordinate) have
    // no span to interpolate over: the eased coordinate stays 0.
    const coordinateDelta = keyframeAfter.coordinate - keyframeBefore.coordinate;
    const relativeCoordinate = coordinateDelta === 0 ? 0 : (coordinate - keyframeBefore.coordinate) / coordinateDelta;
    const relative = Math.max(0, Math.min(1, relativeCoordinate)) as Relative;

    return [keyframeBefore, keyframeAfter, relative];
  }

  // Interpolation from a list already filtered by property presence, for the
  // ascending sampling loop. Keeps the getInterpolatedValue semantics without
  // re-filtering the full keyframe array per sample.
  private getInterpolatedValueInFilteredList<FootKeyframeType extends FootKeyframe>(
    property: keyof FootData,
    coordinate: number,
    filtered: FootKeyframeType[],
    fallback?: FootKeyframeType[],
  ): Interpolable | undefined {
    const list = filtered.length > 0 || fallback === undefined ? filtered : fallback;
    if (list.length === 0) return undefined;
    const cut = Math.min(upperBoundCoordinate(list, coordinate), list.length - 1);
    const keyframeAfter = list[cut]!;
    const keyframeBefore = list[Math.max(0, cut - 1)]!;
    const coordinateDelta = keyframeAfter.coordinate - keyframeBefore.coordinate;
    const relative =
      coordinateDelta === 0 ? 0 : Math.max(0, Math.min(1, (coordinate - keyframeBefore.coordinate) / coordinateDelta));
    return interpolate(
      keyframeBefore.data[property] as Interpolable,
      keyframeAfter.data[property] as Interpolable,
      relative,
    );
  }

  getInterpolatedValue<
    Key extends FootOrHipsKey,
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
    return interpolate(beforeValue as Interpolatable, afterValue as Interpolatable, easedCoordinate) as Interpolable;
  }
}

function getEasedTime(
  keyframeBefore: { transitionOut: Transition },
  keyframeAfter: { transitionIn: Transition },
  relativeCoordinate: number,
): number {
  const transitionStart = keyframeBefore.transitionOut;
  const transitionEnd = keyframeAfter.transitionIn;
  const s = relativeCoordinate;
  let easedCoordinate: number;

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

function getFloorAngleFromDirection(direction: Vector<3>): number {
  return Math.atan2(direction.y, direction.x);
}

function upperBoundCoordinate(list: Array<{ coordinate: number }>, u: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid]!.coordinate <= u) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function getRelativeForwardDirection(orientation: Quaternion): Vector<3> {
  return new Vector<3>(1, 0, 0).rotate(orientation);
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

export function hasTimeEvolution(sequence: Sequence): boolean {
  return sequence.keyframes.time.length > 1;
}

export function sequenceTimeRange(sequence: Sequence, bpm: number = DEFAULT_BPM): [Time, Time] | null {
  if (sequence.path.curves.length === 0) return null;
  const start = sequence.getTimeFromPathCoordinate(0 as PathCoordinate, bpm);
  const end = sequence.getTimeFromPathCoordinate(sequence.path.length as PathCoordinate, bpm);
  return [start < end ? start : end, start < end ? end : start];
}
