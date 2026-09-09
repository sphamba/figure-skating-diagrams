/* Glide classes: elements that set a static pose or a crossed/normal stroke for both feet and the hips. */

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

/** JSON shape of a Glide element used for (de)serialization. */
export interface GlideJSON {
  type: string;
  start: PathCoordinate;
  end: PathCoordinate;
}

/**
 * A Glide element sets the pose for the span it covers: the feet marked as
 * on the ice rest on the ice (height 0), the other feet are lifted off the
 * ice at a fixed height. Foot orientation faces forward or backward, on-ice
 * feet are centered except in the two-foot pose, and the off-ice foot sits
 * half the spacing to its side of the lateral center. A one-foot glide is
 * skated on an inside edge, an outside edge, or with no edge; a two-foot
 * glide has no edge. Keyframes are placed at the start and the end of the
 * span and blend smoothly into the neighboring elements.
 */
export abstract class Glide extends Element {
  /** True when the pose faces forward along the path, false for backward. */
  abstract readonly forward: boolean;
  /** True when the left foot is on the ice in this glide. */
  abstract readonly leftOnIce: boolean;
  /** True when the right foot is on the ice in this glide. */
  abstract readonly rightOnIce: boolean;
  /** Skated edge of the on-ice foot. A two-foot glide is "neither". */
  abstract readonly edge: "inside" | "outside" | "neither";

  /** Name used to identify this glide type when (de)serializing. */
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

  /** Serialize this glide to a plain JSON object. */
  toJSON(): GlideJSON {
    return { type: this.type, start: this.start, end: this.end };
  }

  /** Reconstruct a glide of the matching concrete type from serialized data. */
  static fromJSON(json: GlideJSON): Glide {
    const constructor = glideConstructorsByType[json.type];
    if (!constructor) {
      throw new Error(`Unknown glide type: ${json.type}`);
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
   * An on-ice foot is centered, except in the two-foot glide where it sits
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

export class LeftForwardInsideGlide extends Glide {
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
    return "LeftForwardInsideGlide";
  }
}

export class LeftForwardOutsideGlide extends Glide {
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
    return "LeftForwardOutsideGlide";
  }
}

export class LeftForwardGlide extends Glide {
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
    return "LeftForwardGlide";
  }
}

export class LeftBackwardInsideGlide extends Glide {
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
    return "LeftBackwardInsideGlide";
  }
}

export class LeftBackwardOutsideGlide extends Glide {
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
    return "LeftBackwardOutsideGlide";
  }
}

export class LeftBackwardGlide extends Glide {
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
    return "LeftBackwardGlide";
  }
}

export class RightForwardInsideGlide extends Glide {
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
    return "RightForwardInsideGlide";
  }
}

export class RightForwardOutsideGlide extends Glide {
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
    return "RightForwardOutsideGlide";
  }
}

export class RightForwardGlide extends Glide {
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
    return "RightForwardGlide";
  }
}

export class RightBackwardInsideGlide extends Glide {
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
    return "RightBackwardInsideGlide";
  }
}

export class RightBackwardOutsideGlide extends Glide {
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
    return "RightBackwardOutsideGlide";
  }
}

export class RightBackwardGlide extends Glide {
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
    return "RightBackwardGlide";
  }
}

export class BothForwardGlide extends Glide {
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
    return "BothForwardGlide";
  }
}

export class BothBackwardGlide extends Glide {
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
    return "BothBackwardGlide";
  }
}

/**
 * A dynamic glide is a crossed (crossover) or normal stroke: at the start of
 * the stroke both feet rest on the ice, shifted to the sides of the
 * centerline (swapped when the free foot crosses over, or when the stroke
 * goes backwards). One foot keeps skating the center of the element and
 * glides into the stroke (centered from 95% of completion on). The other
 * foot stays shifted to its side, shifts 0.5 m backwards along the path
 * (forwards for a backwards stroke), rests on the ice until 95% of
 * completion, and lifts off at the end of the stroke.
 */
export abstract class DynamicGlide extends Glide {
  /** True when the center foot of the stroke is the left foot. */
  abstract readonly left: boolean;
  /** True when the free foot crosses over the other one at the sides. */
  abstract readonly crossed: boolean;

  get leftOnIce(): boolean {
    return this.left;
  }

  get rightOnIce(): boolean {
    return !this.left;
  }

  getLeftFootKeyframes(spanScale?: number): FootKeyframe[] {
    return this.dynamicFootKeyframes("footL", spanScale);
  }

  getRightFootKeyframes(spanScale?: number): FootKeyframe[] {
    return this.dynamicFootKeyframes("footR", spanScale);
  }

  /** Foot keyframes of the dynamic stroke: start (both feet on the ice at the
   * sides), 95% (the free foot still on the ice, shifted to its side and
   * 0.5 m backwards along the path) and end (the free foot off the ice at the
   * same shift). Swapped when crossed, or when the stroke goes backwards. */
  private dynamicFootKeyframes(footKey: "footL" | "footR", spanScale?: number): FootKeyframe[] {
    const [start, t95, end] = this.scaledKeyframeCoordinates(spanScale);
    const gliding = footKey === (this.left ? "footL" : "footR");
    let side = footKey === "footL" ? halfFeetSpacing : -halfFeetSpacing;
    const swapped = this.crossed || !this.forward;
    if (swapped) {
      side = -side;
    }
    const facing = getQuaternionFromAngleAxis(this.forward ? 0 : Math.PI);
    const onIceData = (position: Vector<3>): FootData => {
      return { position, orientation: facing, contactPoint: 0.5 };
    };
    // Free foot shifted 0.5 m backwards along the path (forwards when the
    // stroke goes backwards).
    const offset = this.forward ? -0.5 : 0.5;
    if (gliding) {
      const centered = onIceData(new Vector<3>(0, 0, 0));
      return [
        new FootKeyframe(start, onIceData(new Vector<3>(0, side, 0)), "smooth", "smooth"),
        new FootKeyframe(t95, centered, "smooth", "smooth"),
        new FootKeyframe(end, centered, "smooth", "smooth"),
      ];
    }
    return [
      new FootKeyframe(start, onIceData(new Vector<3>(0, side, 0)), "smooth", "smooth"),
      new FootKeyframe(t95, onIceData(new Vector<3>(offset, side, 0)), "smooth", "smooth"),
      new FootKeyframe(end, onIceData(new Vector<3>(offset, side, offIceFootHeight)), "smooth", "smooth"),
    ];
  }

  /** Span to place keyframes on, with the 95% coordinate in the middle,
   * optionally scaled about the middle. */
  private scaledKeyframeCoordinates(spanScale?: number): [PathCoordinate, PathCoordinate, PathCoordinate] {
    const t95 = (this.start + 0.95 * (this.end - this.start)) as PathCoordinate;
    if (spanScale === undefined || spanScale === 1) {
      return [this.start, t95, this.end];
    }
    const middle = (this.start + this.end) / 2;
    const at = (coordinate: PathCoordinate) => (middle + (coordinate - middle) * spanScale) as PathCoordinate;
    return [at(this.start), at(t95), at(this.end)];
  }
}

export class LeftNormalForwardInsideGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "LeftNormalForwardInsideGlide";
  }
}

export class LeftCrossedForwardInsideGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "LeftCrossedForwardInsideGlide";
  }
}

export class LeftNormalForwardOutsideGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "LeftNormalForwardOutsideGlide";
  }
}

export class LeftCrossedForwardOutsideGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "LeftCrossedForwardOutsideGlide";
  }
}

export class LeftNormalForwardGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "LeftNormalForwardGlide";
  }
}

export class LeftCrossedForwardGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "LeftCrossedForwardGlide";
  }
}

export class LeftNormalBackwardInsideGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "LeftNormalBackwardInsideGlide";
  }
}

export class LeftCrossedBackwardInsideGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "LeftCrossedBackwardInsideGlide";
  }
}

export class LeftNormalBackwardOutsideGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "LeftNormalBackwardOutsideGlide";
  }
}

export class LeftCrossedBackwardOutsideGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "LeftCrossedBackwardOutsideGlide";
  }
}

export class LeftNormalBackwardGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "LeftNormalBackwardGlide";
  }
}

export class LeftCrossedBackwardGlide extends DynamicGlide {
  get left(): boolean {
    return true;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "LeftCrossedBackwardGlide";
  }
}

export class RightNormalForwardInsideGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "RightNormalForwardInsideGlide";
  }
}

export class RightCrossedForwardInsideGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "RightCrossedForwardInsideGlide";
  }
}

export class RightNormalForwardOutsideGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "RightNormalForwardOutsideGlide";
  }
}

export class RightCrossedForwardOutsideGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "RightCrossedForwardOutsideGlide";
  }
}

export class RightNormalForwardGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "RightNormalForwardGlide";
  }
}

export class RightCrossedForwardGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return true;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "RightCrossedForwardGlide";
  }
}

export class RightNormalBackwardInsideGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "RightNormalBackwardInsideGlide";
  }
}

export class RightCrossedBackwardInsideGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "inside" {
    return "inside";
  }

  get type(): string {
    return "RightCrossedBackwardInsideGlide";
  }
}

export class RightNormalBackwardOutsideGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "RightNormalBackwardOutsideGlide";
  }
}

export class RightCrossedBackwardOutsideGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "outside" {
    return "outside";
  }

  get type(): string {
    return "RightCrossedBackwardOutsideGlide";
  }
}

export class RightNormalBackwardGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return false;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "RightNormalBackwardGlide";
  }
}

export class RightCrossedBackwardGlide extends DynamicGlide {
  get left(): boolean {
    return false;
  }

  get crossed(): boolean {
    return true;
  }

  get forward(): boolean {
    return false;
  }

  get edge(): "neither" {
    return "neither";
  }

  get type(): string {
    return "RightCrossedBackwardGlide";
  }
}

/** Map a glide type name to its constructor, for deserialization. */
export type GlideConstructor = new (start: PathCoordinate, end: PathCoordinate) => Glide;

export const glideConstructorsByType: Record<string, GlideConstructor> = {
  LeftForwardInsideGlide,
  LeftForwardOutsideGlide,
  LeftForwardGlide,
  LeftBackwardInsideGlide,
  LeftBackwardOutsideGlide,
  LeftBackwardGlide,
  RightForwardInsideGlide,
  RightForwardOutsideGlide,
  RightForwardGlide,
  RightBackwardInsideGlide,
  RightBackwardOutsideGlide,
  RightBackwardGlide,
  BothForwardGlide,
  BothBackwardGlide,
  LeftNormalForwardInsideGlide,
  LeftCrossedForwardInsideGlide,
  LeftNormalForwardOutsideGlide,
  LeftCrossedForwardOutsideGlide,
  LeftNormalForwardGlide,
  LeftCrossedForwardGlide,
  LeftNormalBackwardInsideGlide,
  LeftCrossedBackwardInsideGlide,
  LeftNormalBackwardOutsideGlide,
  LeftCrossedBackwardOutsideGlide,
  LeftNormalBackwardGlide,
  LeftCrossedBackwardGlide,
  RightNormalForwardInsideGlide,
  RightCrossedForwardInsideGlide,
  RightNormalForwardOutsideGlide,
  RightCrossedForwardOutsideGlide,
  RightNormalForwardGlide,
  RightCrossedForwardGlide,
  RightNormalBackwardInsideGlide,
  RightCrossedBackwardInsideGlide,
  RightNormalBackwardOutsideGlide,
  RightCrossedBackwardOutsideGlide,
  RightNormalBackwardGlide,
  RightCrossedBackwardGlide,
};

/** Human-readable label for each available glide kind. */
export const glideKindChoices: { type: string; label: string }[] = [
  { type: "LeftForwardInsideGlide", label: "Left forward inside glide" },
  { type: "LeftForwardOutsideGlide", label: "Left forward outside glide" },
  { type: "LeftForwardGlide", label: "Left forward glide" },
  { type: "LeftBackwardInsideGlide", label: "Left backward inside glide" },
  { type: "LeftBackwardOutsideGlide", label: "Left backward outside glide" },
  { type: "LeftBackwardGlide", label: "Left backward glide" },
  { type: "RightForwardInsideGlide", label: "Right forward inside glide" },
  { type: "RightForwardOutsideGlide", label: "Right forward outside glide" },
  { type: "RightForwardGlide", label: "Right forward glide" },
  { type: "RightBackwardInsideGlide", label: "Right backward inside glide" },
  { type: "RightBackwardOutsideGlide", label: "Right backward outside glide" },
  { type: "RightBackwardGlide", label: "Right backward glide" },
  { type: "LeftNormalForwardInsideGlide", label: "Left normal forward inside glide" },
  { type: "LeftCrossedForwardInsideGlide", label: "Left crossed forward inside glide" },
  { type: "LeftNormalForwardOutsideGlide", label: "Left normal forward outside glide" },
  { type: "LeftCrossedForwardOutsideGlide", label: "Left crossed forward outside glide" },
  { type: "LeftNormalForwardGlide", label: "Left normal forward glide" },
  { type: "LeftCrossedForwardGlide", label: "Left crossed forward glide" },
  { type: "LeftNormalBackwardInsideGlide", label: "Left normal backward inside glide" },
  { type: "LeftCrossedBackwardInsideGlide", label: "Left crossed backward inside glide" },
  { type: "LeftNormalBackwardOutsideGlide", label: "Left normal backward outside glide" },
  { type: "LeftCrossedBackwardOutsideGlide", label: "Left crossed backward outside glide" },
  { type: "LeftNormalBackwardGlide", label: "Left normal backward glide" },
  { type: "LeftCrossedBackwardGlide", label: "Left crossed backward glide" },
  { type: "RightNormalForwardInsideGlide", label: "Right normal forward inside glide" },
  { type: "RightCrossedForwardInsideGlide", label: "Right crossed forward inside glide" },
  { type: "RightNormalForwardOutsideGlide", label: "Right normal forward outside glide" },
  { type: "RightCrossedForwardOutsideGlide", label: "Right crossed forward outside glide" },
  { type: "RightNormalForwardGlide", label: "Right normal forward glide" },
  { type: "RightCrossedForwardGlide", label: "Right crossed forward glide" },
  { type: "RightNormalBackwardInsideGlide", label: "Right normal backward inside glide" },
  { type: "RightCrossedBackwardInsideGlide", label: "Right crossed backward inside glide" },
  { type: "RightNormalBackwardOutsideGlide", label: "Right normal backward outside glide" },
  { type: "RightCrossedBackwardOutsideGlide", label: "Right crossed backward outside glide" },
  { type: "RightNormalBackwardGlide", label: "Right normal backward glide" },
  { type: "RightCrossedBackwardGlide", label: "Right crossed backward glide" },
  { type: "BothForwardGlide", label: "Two-foot forward glide" },
  { type: "BothBackwardGlide", label: "Two-foot backward glide" },
];
