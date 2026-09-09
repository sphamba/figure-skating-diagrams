/* Base class for one-foot turns: span, turn flags and serialization. */

import { bladeLength } from "../constants.js";
import type { PathCoordinate } from "../coordinates.js";
import { Element } from "./element.js";
import type { FootKeyframe, HipsKeyframe } from "../keyframe.js";
import type { FootKey } from "../sequence.js";

/** Default length of the smooth entry/exit portion of a turn, in path units. */
export const defaultFootTurnLength = (bladeLength * 1.6) as PathCoordinate;

/** JSON shape of a FootTurn used for (de)serialization. */
export interface FootTurnJSON {
  type: string;
  start: PathCoordinate;
  end: PathCoordinate;
}

/**
 * A FootTurn is an element performed on one foot (the on-ice foot given by
 * `footKey`). The other foot is the free foot. Both feet and the hips get
 * keyframes: the on-ice foot gets the detailed turn keyframes, the free foot
 * and the hips get minimal keyframes at the ends of the element.
 */
export abstract class FootTurn extends Element {
  footKey: FootKey;
  /** True when the turn rotates to the left. */
  abstract readonly left: boolean;
  /** True when the entry edge travels forward along the path. */
  abstract readonly forward: boolean;
  /** True when the skated edge is an inside edge, false for outside. */
  abstract readonly inside: boolean;
  /** Name used to identify this turn type when (de)serializing. */
  abstract readonly type: string;

  /** Turns scale: their keyframes and displayed span re-base onto the span
   * scaled about its middle when a span scale is active. */
  get scalable(): boolean {
    return true;
  }

  constructor(footKey: FootKey, start: PathCoordinate, end: PathCoordinate) {
    super(start, end);
    this.footKey = footKey;
  }

  /** True when the turn rotates clockwise: a left turn on an inside edge
   * (or a right turn on an outside edge) rotates clockwise. For backward
   * turns the inside and outside edges are reversed: a left turn on an
   * outside edge (or a right turn on an inside edge) rotates clockwise. */
  get clockwise(): boolean {
    return (this.left === this.inside) === this.forward;
  }

  /** Span to place keyframes on, optionally scaled about the middle. */
  protected keyframeSpan(spanScale?: number): [PathCoordinate, PathCoordinate] {
    if (spanScale === undefined || spanScale === 1) {
      return [this.start, this.end];
    }
    return scaledSpan(this.start, this.end, spanScale);
  }

  /** Detailed keyframes for the on-ice foot across the (scaled) span. When a
   * lateral scale is given, the lateral shift is scaled by the factor. */
  protected abstract createOnIceFootKeyframes(
    start: PathCoordinate,
    end: PathCoordinate,
    lateralScale?: number,
  ): FootKeyframe[];

  /** Minimal keyframes for the free foot at the ends of the (scaled) span.
   * When a lateral scale is given, the lateral shift is scaled by the
   * factor. */
  protected abstract createFreeFootKeyframes(
    start: PathCoordinate,
    end: PathCoordinate,
    lateralScale?: number,
  ): FootKeyframe[];

  /** Minimal keyframes for the hips at the ends of the (scaled) span. */
  protected abstract createHipsKeyframes(start: PathCoordinate, end: PathCoordinate): HipsKeyframe[];

  /** Serialize this turn to a plain JSON object. */
  toJSON(): FootTurnJSON {
    return {
      type: this.type,
      start: this.start,
      end: this.end,
    };
  }

  /** Reconstruct a turn of the matching concrete type from serialized data.
   * The registry is filled by turnTypes.ts. */
  static fromJSON(json: FootTurnJSON): FootTurn {
    const constructor = footTurnConstructorsByType[json.type];
    if (!constructor) {
      throw new Error(`Unknown foot turn type: ${json.type}`);
    }
    const footKey = json.type.startsWith("Right") ? "footR" : "footL";
    return new constructor(footKey, json.start as PathCoordinate, json.end as PathCoordinate);
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

export type FootTurnConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => FootTurn;

/** A turn constructor, with the optional loop shift of loops. */
export type FootTurnClass = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => FootTurn;

/** Map a turn type name to its constructor, for deserialization. Filled by
 * turnTypes.ts, which imports the concrete turn modules. */
export const footTurnConstructorsByType: Record<string, FootTurnClass> = {};

/**
 * Build a foot turn of the given type from an existing element's properties
 * (foot key and span). This is how an element is converted
 * from one kind to another without moving it.
 */
export function changeFootTurnType(type: string, template: FootTurnJSON): FootTurn {
  return FootTurn.fromJSON({ ...template, type });
}
