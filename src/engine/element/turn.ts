/* Set of 3 keyframes to define a turn */

import { bladeLength } from "../constants.js";
import type { PathCoordinate } from "../coordinates.js";
import { Element } from "./element.js";
import { type FootData, FootKeyframe, type HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { setConstructorsByType, setKindChoices } from "./basic.js";
import type { FootKey } from "../sequence.js";
import { Vector } from "../vector.js";

// Arbitrary, depends on interpolation functions
const defaultPathLengthSmooth = (bladeLength * 1.6) as PathCoordinate;
// To have loop length equal to 1.5 * bladeLength
const defaultLoopShift = (bladeLength * 0.9) as PathCoordinate;

/** JSON shape of a FootTurn used for (de)serialization. */
export interface FootTurnJSON {
  type: string;
  footKey: FootKey;
  start: PathCoordinate;
  end: PathCoordinate;
  smoothEntry: boolean;
  smoothExit: boolean;
  loopShift?: PathCoordinate;
}

export abstract class FootTurn extends Element {
  footKey: FootKey;
  smoothEntry: boolean;
  smoothExit: boolean;
  abstract readonly clockwise: boolean;
  abstract readonly initialAngle: number;
  abstract readonly angleIncrement: number;
  abstract readonly contactPointTurn: number;
  /** Name used to identify this turn type when (de)serializing. */
  abstract readonly type: string;

  constructor(
    footKey: FootKey,
    start: PathCoordinate,
    end: PathCoordinate,
    smoothEntry: boolean = true,
    smoothExit: boolean = true,
  ) {
    super(start, end);
    this.footKey = footKey;
    this.smoothEntry = smoothEntry;
    this.smoothExit = smoothExit;
  }

  /** Path coordinate at the center of the turn, halfway between start and end. */
  get pathCoordinate(): PathCoordinate {
    return ((this.start + this.end) / 2) as PathCoordinate;
  }

  get pathLengthEntry(): PathCoordinate {
    return (this.pathCoordinate - this.start) as PathCoordinate;
  }

  get pathLengthExit(): PathCoordinate {
    return (this.end - this.pathCoordinate) as PathCoordinate;
  }

  /** The turn is performed on the skating foot. The free foot has no keyframes.
   * When a span scale is given, the keyframes are recomputed as if the element
   * spanned the span scaled about its middle point: same kind, moved ends. The
   * element itself is never modified. */
  getLeftFootKeyframes(spanScale?: number): FootKeyframe[] {
    return this.footKey === "footL" ? this.createScaledKeyframes(spanScale) : [];
  }

  getRightFootKeyframes(spanScale?: number): FootKeyframe[] {
    return this.footKey === "footR" ? this.createScaledKeyframes(spanScale) : [];
  }

  getHipsKeyframes(_spanScale?: number): HipsKeyframe[] {
    return [];
  }

  /** Keyframes for this foot, recomputed for a scaled span when requested. */
  private createScaledKeyframes(spanScale?: number): FootKeyframe[] {
    if (spanScale === undefined || spanScale === 1) {
      return this.createKeyframes(this.start, this.end);
    }
    const [start, end] = scaledSpan(this.start, this.end, spanScale);
    return this.createKeyframes(start, end);
  }

  /** Compute the turn keyframes from the element's span. */
  protected abstract createKeyframes(start: PathCoordinate, end: PathCoordinate): FootKeyframe[];

  /** Serialize this turn to a plain JSON object. */
  toJSON(): FootTurnJSON {
    return {
      type: this.type,
      footKey: this.footKey,
      start: this.start,
      end: this.end,
      smoothEntry: this.smoothEntry,
      smoothExit: this.smoothExit,
    };
  }

  /** Reconstruct a turn of the matching concrete type from serialized data. */
  static fromJSON(json: FootTurnJSON): FootTurn {
    const constructor = footTurnConstructorsByType[json.type];
    if (!constructor) {
      throw new Error(`Unknown foot turn type: ${json.type}`);
    }
    return new constructor(
      json.footKey as FootKey,
      json.start as PathCoordinate,
      json.end as PathCoordinate,
      json.smoothEntry,
      json.smoothExit,
      json.loopShift as PathCoordinate | undefined,
    );
  }
}

/**
 * The span scaled about its middle point by the given factor, computed only
 * from the given coordinates: no element state is used or modified.
 */
function scaledSpan(start: PathCoordinate, end: PathCoordinate, factor: number): [PathCoordinate, PathCoordinate] {
  const middle = (start + end) / 2;
  return [(middle + (start - middle) * factor) as PathCoordinate, (middle + (end - middle) * factor) as PathCoordinate];
}

export type FootTurnConstructor = new (
  footKey: FootKey,
  start: PathCoordinate,
  end: PathCoordinate,
  smoothEntry?: boolean,
  smoothExit?: boolean,
) => FootTurn;

type FootTurnClass = new (
  footKey: FootKey,
  start: PathCoordinate,
  end: PathCoordinate,
  smoothEntry?: boolean,
  smoothExit?: boolean,
  loopShift?: PathCoordinate,
) => FootTurn;

abstract class FootHalfTurn extends FootTurn {
  abstract readonly forward: boolean;

  get initialAngle(): number {
    return this.forward ? 0 : Math.PI;
  }

  get angleIncrement(): number {
    return this.clockwise ? -Math.PI / 2 : Math.PI / 2;
  }

  get contactPointTurn(): number {
    return this.forward ? 1 : 0;
  }

  createKeyframes(start: PathCoordinate, end: PathCoordinate): FootKeyframe[] {
    const pathCoordinate = ((start + end) / 2) as PathCoordinate;
    const pathLengthEntry = (pathCoordinate - start) as PathCoordinate;
    const pathLengthExit = (end - pathCoordinate) as PathCoordinate;
    const pathCoordinateShifts = [-pathLengthEntry, 0, pathLengthExit];
    const pathCoordinates = pathCoordinateShifts.map(
      (pathCoordinateShift) => (pathCoordinate + pathCoordinateShift) as PathCoordinate,
    );

    const keyframes: FootKeyframe[] = [];
    for (let i = 0; i < 3; i++) {
      const pathCoordinate = pathCoordinates[i]!;
      const angle = this.initialAngle + i * this.angleIncrement;
      const contactPoint = i == 1 ? this.contactPointTurn : 0.5;

      const keyframeData = {
        orientation: getQuaternionFromAngleAxis(angle),
        contactPoint: contactPoint,
      };

      const keyframe = new FootKeyframe(
        pathCoordinate,
        keyframeData,
        // Smooth entry and exit into the turn
        this.smoothExit && i == 2 ? "smooth" : "linear",
        this.smoothEntry && i == 0 ? "smooth" : "linear",
      );

      keyframes.push(keyframe);
    }
    return keyframes;
  }
}

export class ForwardClockwiseFootTurn extends FootHalfTurn {
  get forward(): boolean {
    return true;
  }

  get clockwise(): boolean {
    return true;
  }

  get type(): string {
    return "ForwardClockwiseFootTurn";
  }
}

export class ForwardCounterClockwiseFootTurn extends FootHalfTurn {
  get forward(): boolean {
    return true;
  }

  get clockwise(): boolean {
    return false;
  }

  get type(): string {
    return "ForwardCounterClockwiseFootTurn";
  }
}

export class BackwardClockwiseFootTurn extends FootHalfTurn {
  get forward(): boolean {
    return false;
  }

  get clockwise(): boolean {
    return true;
  }

  get type(): string {
    return "BackwardClockwiseFootTurn";
  }
}

export class BackwardCounterClockwiseFootTurn extends FootHalfTurn {
  get forward(): boolean {
    return false;
  }

  get clockwise(): boolean {
    return false;
  }

  get type(): string {
    return "BackwardCounterClockwiseFootTurn";
  }
}

abstract class FootLoop extends FootTurn {
  abstract readonly forward: boolean;
  loopShift: PathCoordinate;

  constructor(
    footKey: FootKey,
    start: PathCoordinate,
    end: PathCoordinate,
    smoothEntry: boolean = true,
    smoothExit: boolean = true,
    loopShift?: PathCoordinate,
  ) {
    super(footKey, start, end, smoothEntry, smoothExit);
    this.loopShift = loopShift ?? defaultLoopShift;
  }

  get initialAngle(): number {
    return this.forward ? 0 : Math.PI;
  }

  get angleIncrement(): number {
    return this.clockwise ? -Math.PI : Math.PI;
  }

  get contactPointTurn(): number {
    return this.forward ? 0 : 1;
  }

  toJSON(): FootTurnJSON {
    return { ...super.toJSON(), loopShift: this.loopShift };
  }

  createKeyframes(start: PathCoordinate, end: PathCoordinate): FootKeyframe[] {
    if (!this.loopShift) return [];

    const pathCoordinate = ((start + end) / 2) as PathCoordinate;
    const pathLengthEntry = (pathCoordinate - start) as PathCoordinate;
    const pathLengthExit = (end - pathCoordinate) as PathCoordinate;
    const pathCoordinateShifts = [-pathLengthEntry, 0, pathLengthExit];
    const pathCoordinates = pathCoordinateShifts.map(
      (pathCoordinateShift) => (pathCoordinate + pathCoordinateShift) as PathCoordinate,
    );
    const contactPoints = [0.5, this.contactPointTurn, 0.5];
    const lateralShift = (this.clockwise ? 1 : -1) * (this.forward ? 1 : -1) * this.loopShift;
    const positions = [
      new Vector<3>(0, lateralShift, 0),
      new Vector<3>((0.5 - this.contactPointTurn) * bladeLength, lateralShift, 0),
      new Vector<3>(0, lateralShift, 0),
    ];

    const keyframes: FootKeyframe[] = [];
    for (let i = 0; i < 3; i++) {
      const pathCoordinate = pathCoordinates[i]!;
      const angle = this.initialAngle + i * this.angleIncrement;
      const contactPoint = contactPoints[i];

      const keyframeData: FootData = {
        orientation: getQuaternionFromAngleAxis(angle),
        contactPoint: contactPoint,
      };

      const position = positions[i];
      if (position) {
        keyframeData.position = position;
      }

      const keyframe = new FootKeyframe(
        pathCoordinate,
        keyframeData,
        // Smooth entry and exit into the turn
        this.smoothExit && i != 1 ? "smooth" : "linear",
        this.smoothEntry && i != 1 ? "smooth" : "linear",
      );

      keyframes.push(keyframe);
    }
    return keyframes;
  }
}

export class ForwardClockwiseFootLoop extends FootLoop {
  get forward(): boolean {
    return true;
  }

  get clockwise(): boolean {
    return true;
  }

  get type(): string {
    return "ForwardClockwiseFootLoop";
  }
}

export class ForwardCounterClockwiseFootLoop extends FootLoop {
  get forward(): boolean {
    return true;
  }

  get clockwise(): boolean {
    return false;
  }

  get type(): string {
    return "ForwardCounterClockwiseFootLoop";
  }
}

export class BackwardClockwiseFootLoop extends FootLoop {
  get forward(): boolean {
    return false;
  }

  get clockwise(): boolean {
    return true;
  }

  get type(): string {
    return "BackwardClockwiseFootLoop";
  }
}

export class BackwardCounterClockwiseFootLoop extends FootLoop {
  get forward(): boolean {
    return false;
  }

  get clockwise(): boolean {
    return false;
  }

  get type(): string {
    return "BackwardCounterClockwiseFootLoop";
  }
}

/** Map a turn type name to its constructor, for deserialization. */
const footTurnConstructorsByType: Record<string, FootTurnClass> = {
  ForwardClockwiseFootTurn,
  ForwardCounterClockwiseFootTurn,
  BackwardClockwiseFootTurn,
  BackwardCounterClockwiseFootTurn,
  ForwardClockwiseFootLoop,
  ForwardCounterClockwiseFootLoop,
  BackwardClockwiseFootLoop,
  BackwardCounterClockwiseFootLoop,
};

/** Default length of the smooth entry/exit portion of a turn, in path units. */
export const defaultFootTurnLength = defaultPathLengthSmooth;

/** Human-readable label for each available element (foot turn) kind. */
export const footTurnKindChoices: { type: string; label: string }[] = [
  { type: "ForwardClockwiseFootTurn", label: "Forward clockwise turn" },
  { type: "ForwardCounterClockwiseFootTurn", label: "Forward counter-clockwise turn" },
  { type: "BackwardClockwiseFootTurn", label: "Backward clockwise turn" },
  { type: "BackwardCounterClockwiseFootTurn", label: "Backward counter-clockwise turn" },
  { type: "ForwardClockwiseFootLoop", label: "Forward clockwise loop" },
  { type: "ForwardCounterClockwiseFootLoop", label: "Forward counter-clockwise loop" },
  { type: "BackwardClockwiseFootLoop", label: "Backward clockwise loop" },
  { type: "BackwardCounterClockwiseFootLoop", label: "Backward counter-clockwise loop" },
  ...setKindChoices,
];

/**
 * Build an element of the given type from an existing element's serialized
 * properties (span, and for foot turns foot key and smoothing). This is how
 * an element is converted from one kind to another without moving it.
 */
export function changeElementType(
  type: string,
  template: {
    type: string;
    start: number;
    end: number;
    footKey?: string;
    smoothEntry?: boolean;
    smoothExit?: boolean;
    loopShift?: number;
  },
): Element {
  const start = template.start as PathCoordinate;
  const end = template.end as PathCoordinate;
  const setConstructor = setConstructorsByType[type];
  if (setConstructor) {
    return new setConstructor(start, end);
  }
  return changeFootTurnType(type, { ...template, start, end, type } as FootTurnJSON);
}

/**
 * Build a foot turn of the given type from an existing element's properties
 * (foot key, span, smoothing, loop shift). This is how an element is converted
 * from one kind to another without moving it.
 */
export function changeFootTurnType(type: string, template: FootTurnJSON): FootTurn {
  return FootTurn.fromJSON({ ...template, type });
}

/**
 * Build a fresh foot turn of the first available kind (the default kind) with
 * the given span. Used for provisional, not-yet-added elements.
 */
export function createDefaultFootTurn(
  start: PathCoordinate,
  end: PathCoordinate,
  footKey: FootKey = "footL",
): FootTurn {
  const type = footTurnKindChoices[0]!.type;
  const constructor = footTurnConstructorsByType[type]!;
  return new constructor(footKey, start, end);
}
