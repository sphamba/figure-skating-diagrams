/* Stroke classes: elements that set a static pose for both feet and the hips. */

import type { PathCoordinate } from "../coordinates.js";
import { Element } from "./element.js";
import { type FootData, FootKeyframe, HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";

/** Height above the ice for a foot not on the ice, in metres. */
export const offIceFootHeight = 0.2;

/** Lateral offset of each foot when both feet are on the ice, in metres:
 * the feet are 2 x halfFeetSpacing apart. */
export const halfFeetSpacing = 0.15;

/** JSON shape of a Stroke element used for (de)serialization. */
export interface StrokeJSON {
  type: string;
  start: PathCoordinate;
  end: PathCoordinate;
}

/**
 * A Stroke element sets the pose for the span it covers: the feet marked as
 * on the ice rest on the ice (height 0), the other feet are lifted off the
 * ice at a fixed height. Foot orientation faces forward or backward, on-ice
 * feet are centered except in the two-foot pose, and the off-ice foot sits
 * half the spacing to its side of the lateral center. A one-foot stroke is
 * skated on an inside edge, an outside edge, or with no edge; a two-foot
 * stroke has no edge. Keyframes are placed at the start and the end of the
 * span and blend smoothly into the neighboring elements.
 */
export abstract class Stroke extends Element {
  /** True when the pose faces forward along the path, false for backward. */
  abstract readonly forward: boolean;
  /** True when the left foot is on the ice in this stroke. */
  abstract readonly leftOnIce: boolean;
  /** True when the right foot is on the ice in this stroke. */
  abstract readonly rightOnIce: boolean;
  /** Skated edge of the on-ice foot. A two-foot stroke is "neither". */
  abstract readonly edge: "inside" | "outside" | "neither";

  /** Name used to identify this stroke type when (de)serializing. */
  abstract readonly type: string;

  getLeftFootKeyframes(spanScale?: number): FootKeyframe[] {
    return this.createFootKeyframes("footL", this.leftOnIce, spanScale);
  }

  getRightFootKeyframes(spanScale?: number): FootKeyframe[] {
    return this.createFootKeyframes("footR", this.rightOnIce, spanScale);
  }

  getHipsKeyframes(spanScale?: number): HipsKeyframe[] {
    const [start, end] = this.scaledKeyframeSpan(spanScale);
    return [
      new HipsKeyframe(
        start,
        { position: new Vector<3>(0, 0, 0), orientation: getQuaternionFromAngleAxis(0) },
        "smooth",
        "smooth",
      ),
      new HipsKeyframe(
        end,
        { position: new Vector<3>(0, 0, 0), orientation: getQuaternionFromAngleAxis(0) },
        "smooth",
        "smooth",
      ),
    ];
  }

  /** Serialize this stroke to a plain JSON object. */
  toJSON(): StrokeJSON {
    return { type: this.type, start: this.start, end: this.end };
  }

  /** Reconstruct a stroke of the matching concrete type from serialized data. */
  static fromJSON(json: StrokeJSON): Stroke {
    const constructor = strokeConstructorsByType[json.type];
    if (!constructor) {
      throw new Error(`Unknown stroke type: ${json.type}`);
    }
    return new constructor(json.start, json.end);
  }

  /** Span to place keyframes on, optionally scaled about the middle. */
  private scaledKeyframeSpan(spanScale?: number): [PathCoordinate, PathCoordinate] {
    if (spanScale === undefined || spanScale === 1) {
      return [this.start, this.end];
    }
    const middle = (this.start + this.end) / 2;
    return [
      (middle + (this.start - middle) * spanScale) as PathCoordinate,
      (middle + (this.end - middle) * spanScale) as PathCoordinate,
    ];
  }

  /** Default keyframes for one foot, at the start and the end of the span.
   * An on-ice foot is centered, except in the two-foot stroke where it sits
   * half the spacing to its side. The off-ice foot always sits half the
   * spacing to its side. */
  private createFootKeyframes(footKey: "footL" | "footR", onIce: boolean, spanScale?: number): FootKeyframe[] {
    const [start, end] = this.scaledKeyframeSpan(spanScale);
    const bothOnIce = this.leftOnIce && this.rightOnIce;
    const side = footKey === "footL" ? halfFeetSpacing : -halfFeetSpacing;
    const lateral = onIce ? (bothOnIce ? side : 0) : side;
    const data: FootData = {
      position: new Vector<3>(0, lateral, onIce ? 0 : offIceFootHeight),
      orientation: getQuaternionFromAngleAxis(this.forward ? 0 : Math.PI),
      contactPoint: 0.5,
    };
    return [new FootKeyframe(start, data, "smooth", "smooth"), new FootKeyframe(end, data, "smooth", "smooth")];
  }
}

export class LeftForwardInsideStroke extends Stroke {
  get forward(): boolean {
    return true;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return false;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "LeftForwardInsideStroke";
  }
}

export class LeftForwardOutsideStroke extends Stroke {
  get forward(): boolean {
    return true;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return false;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "LeftForwardOutsideStroke";
  }
}

export class LeftForwardStroke extends Stroke {
  get forward(): boolean {
    return true;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return false;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "LeftForwardStroke";
  }
}

export class LeftBackwardInsideStroke extends Stroke {
  get forward(): boolean {
    return false;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return false;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "LeftBackwardInsideStroke";
  }
}

export class LeftBackwardOutsideStroke extends Stroke {
  get forward(): boolean {
    return false;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return false;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "LeftBackwardOutsideStroke";
  }
}

export class LeftBackwardStroke extends Stroke {
  get forward(): boolean {
    return false;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return false;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "LeftBackwardStroke";
  }
}

export class RightForwardInsideStroke extends Stroke {
  get forward(): boolean {
    return true;
  }

  get leftOnIce(): boolean {
    return false;
  }

  get rightOnIce(): boolean {
    return true;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "RightForwardInsideStroke";
  }
}

export class RightForwardOutsideStroke extends Stroke {
  get forward(): boolean {
    return true;
  }

  get leftOnIce(): boolean {
    return false;
  }

  get rightOnIce(): boolean {
    return true;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "RightForwardOutsideStroke";
  }
}

export class RightForwardStroke extends Stroke {
  get forward(): boolean {
    return true;
  }

  get leftOnIce(): boolean {
    return false;
  }

  get rightOnIce(): boolean {
    return true;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "RightForwardStroke";
  }
}

export class RightBackwardInsideStroke extends Stroke {
  get forward(): boolean {
    return false;
  }

  get leftOnIce(): boolean {
    return false;
  }

  get rightOnIce(): boolean {
    return true;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "RightBackwardInsideStroke";
  }
}

export class RightBackwardOutsideStroke extends Stroke {
  get forward(): boolean {
    return false;
  }

  get leftOnIce(): boolean {
    return false;
  }

  get rightOnIce(): boolean {
    return true;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "RightBackwardOutsideStroke";
  }
}

export class RightBackwardStroke extends Stroke {
  get forward(): boolean {
    return false;
  }

  get leftOnIce(): boolean {
    return false;
  }

  get rightOnIce(): boolean {
    return true;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "RightBackwardStroke";
  }
}

export class BothForwardStroke extends Stroke {
  get forward(): boolean {
    return true;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return true;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "BothForwardStroke";
  }
}

export class BothBackwardStroke extends Stroke {
  get forward(): boolean {
    return false;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return true;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "BothBackwardStroke";
  }
}

/** Map a stroke type name to its constructor, for deserialization. */
export type StrokeConstructor = new (start: PathCoordinate, end: PathCoordinate) => Stroke;

export const strokeConstructorsByType: Record<string, StrokeConstructor> = {
  LeftForwardInsideStroke,
  LeftForwardOutsideStroke,
  LeftForwardStroke,
  LeftBackwardInsideStroke,
  LeftBackwardOutsideStroke,
  LeftBackwardStroke,
  RightForwardInsideStroke,
  RightForwardOutsideStroke,
  RightForwardStroke,
  RightBackwardInsideStroke,
  RightBackwardOutsideStroke,
  RightBackwardStroke,
  BothForwardStroke,
  BothBackwardStroke,
};

/** Human-readable label for each available stroke kind. */
export const strokeKindChoices: { type: string; label: string }[] = [
  { type: "LeftForwardInsideStroke", label: "Left forward inside stroke" },
  { type: "LeftForwardOutsideStroke", label: "Left forward outside stroke" },
  { type: "LeftForwardStroke", label: "Left forward stroke" },
  { type: "LeftBackwardInsideStroke", label: "Left backward inside stroke" },
  { type: "LeftBackwardOutsideStroke", label: "Left backward outside stroke" },
  { type: "LeftBackwardStroke", label: "Left backward stroke" },
  { type: "RightForwardInsideStroke", label: "Right forward inside stroke" },
  { type: "RightForwardOutsideStroke", label: "Right forward outside stroke" },
  { type: "RightForwardStroke", label: "Right forward stroke" },
  { type: "RightBackwardInsideStroke", label: "Right backward inside stroke" },
  { type: "RightBackwardOutsideStroke", label: "Right backward outside stroke" },
  { type: "RightBackwardStroke", label: "Right backward stroke" },
  { type: "BothForwardStroke", label: "Two-foot forward stroke" },
  { type: "BothBackwardStroke", label: "Two-foot backward stroke" },
];
