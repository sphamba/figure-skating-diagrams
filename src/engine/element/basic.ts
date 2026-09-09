/* Set classes: elements that set a static pose for both feet and the hips. */

import type { PathCoordinate } from "../coordinates.js";
import { Element } from "./element.js";
import { type FootData, FootKeyframe, HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";

/** Height above the ice for a foot not on the ice, in metres. */
const offIceFootHeight = 0.2;

/** Lateral offset of each foot when both feet are on the ice, in metres:
 * the feet are 2 x halfSpacing apart. */
const halfFeetSpacing = 0.15;

/** JSON shape of a Set element used for (de)serialization. */
export interface SetJSON {
  type: string;
  start: PathCoordinate;
  end: PathCoordinate;
}

/**
 * A Set element sets the pose for the span it covers: the feet marked as on
 * the ice rest on the ice (height 0), the other feet are lifted off the ice
 * at a fixed height. Foot orientation faces forward or backward, on-ice
 * feet are centered except in the both-down pose, and the off-ice foot
 * sits half the spacing to its side of the lateral center. The hips
 * orientation. Keyframes are placed at the start and the end of the span and
 * blend smoothly into the neighboring elements.
 */
export abstract class Set extends Element {
  /** True when the pose faces forward along the path, false for backward. */
  abstract readonly forward: boolean;
  /** True when the left foot is on the ice in this pose. */
  abstract readonly leftOnIce: boolean;
  /** True when the right foot is on the ice in this pose. */
  abstract readonly rightOnIce: boolean;

  get type(): string {
    return this.constructor.name;
  }

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

  /** Serialize this set to a plain JSON object. */
  toJSON(): SetJSON {
    return { type: this.type, start: this.start, end: this.end };
  }

  /** Reconstruct a set of the matching concrete type from serialized data. */
  static fromJSON(json: SetJSON): Set {
    const constructor = setConstructorsByType[json.type];
    if (!constructor) {
      throw new Error(`Unknown set type: ${json.type}`);
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
   * An on-ice foot is centered, except in the both-down pose where it sits
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

export class LeftForward extends Set {
  get forward(): boolean {
    return true;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return false;
  }
}

export class RightForward extends Set {
  get forward(): boolean {
    return true;
  }

  get leftOnIce(): boolean {
    return false;
  }

  get rightOnIce(): boolean {
    return true;
  }
}

export class BothForward extends Set {
  get forward(): boolean {
    return true;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return true;
  }
}

export class LeftBackward extends Set {
  get forward(): boolean {
    return false;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return false;
  }
}

export class RightBackward extends Set {
  get forward(): boolean {
    return false;
  }

  get leftOnIce(): boolean {
    return false;
  }

  get rightOnIce(): boolean {
    return true;
  }
}

export class BothBackward extends Set {
  get forward(): boolean {
    return false;
  }

  get leftOnIce(): boolean {
    return true;
  }

  get rightOnIce(): boolean {
    return true;
  }
}

/** Map a set type name to its constructor, for deserialization. */
export const setConstructorsByType: Record<string, typeof LeftForward> = {
  LeftForward,
  RightForward,
  BothForward,
  LeftBackward,
  RightBackward,
  BothBackward,
};

/** Human-readable label for each available set kind. */
export const setKindChoices: { type: string; label: string }[] = [
  { type: "LeftForward", label: "Left forward" },
  { type: "RightForward", label: "Right forward" },
  { type: "BothForward", label: "Both forward" },
  { type: "LeftBackward", label: "Left backward" },
  { type: "RightBackward", label: "Right backward" },
  { type: "BothBackward", label: "Both backward" },
];
