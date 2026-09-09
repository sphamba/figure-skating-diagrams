/* One-foot turns: shared turn center and keyframe routing between parts. */

import type { PathCoordinate } from "../coordinates.js";
import { halfFeetSpacing, offIceFootHeight } from "./glide.js";
import { type FootData, FootKeyframe, HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import { FootTurn } from "./turn.js";

/**
 * A OneFootTurn is a turn on one foot that pivots around the center of the
 * element (halfway between start and end). It provides the concrete part
 * keyframe getters: the on-ice foot gets the detailed turn keyframes, the
 * free foot and the hips get minimal keyframes at the ends of the element.
 */
export abstract class OneFootTurn extends FootTurn {
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

  getLeftFootKeyframes(spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.partFootKeyframes("footL", spanScale, lateralScale);
  }

  getRightFootKeyframes(spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.partFootKeyframes("footR", spanScale, lateralScale);
  }

  getHipsKeyframes(spanScale?: number): HipsKeyframe[] {
    const [start, end] = this.keyframeSpan(spanScale);
    return this.createHipsKeyframes(start, end);
  }

  /** Keyframes for one foot: turn keyframes for the on-ice foot, minimal
   * keyframes for the free foot. */
  private partFootKeyframes(footKey: "footL" | "footR", spanScale?: number, lateralScale?: number): FootKeyframe[] {
    const [start, end] = this.keyframeSpan(spanScale);
    return footKey === this.footKey
      ? this.createOnIceFootKeyframes(start, end, lateralScale)
      : this.createFreeFootKeyframes(start, end, lateralScale);
  }

  /** Minimal keyframes for the free foot: two keyframes at the ends of the
   * span, shifted like the off-ice foot of the glide elements: half the foot
   * spacing to its side of the lateral center, lifted off the ice at a fixed
   * height, facing the direction of travel. The free foot sits opposite the
   * on-ice foot of the turn. When a lateral scale is given, that lateral
   * shift is scaled by the factor. */
  protected createFreeFootKeyframes(start: PathCoordinate, end: PathCoordinate, lateralScale?: number): FootKeyframe[] {
    const scale = lateralScale ?? 1;
    const side = (this.footKey === "footL" ? -halfFeetSpacing : halfFeetSpacing) * scale;
    const data: FootData = {
      position: new Vector<3>(0, side, offIceFootHeight),
      orientation: getQuaternionFromAngleAxis(this.forward ? 0 : Math.PI),
      contactPoint: 0.5,
    };
    return [new FootKeyframe(start, data, "smooth", "smooth"), new FootKeyframe(end, data, "smooth", "smooth")];
  }

  /** Minimal keyframes for the hips: two keyframes at the ends of the span,
   * centered, facing the direction of travel. */
  protected createHipsKeyframes(start: PathCoordinate, end: PathCoordinate): HipsKeyframe[] {
    const data = {
      position: new Vector<3>(0, 0, 0),
      orientation: getQuaternionFromAngleAxis(this.forward ? 0 : Math.PI),
    };
    return [new HipsKeyframe(start, data, "smooth", "smooth"), new HipsKeyframe(end, data, "smooth", "smooth")];
  }

  /** Compute the turn keyframes for the on-ice foot from the element's span.
   * When a lateral scale is given, the lateral shift is scaled by the
   * factor. */
  protected abstract createOnIceFootKeyframes(
    start: PathCoordinate,
    end: PathCoordinate,
    lateralScale?: number,
  ): FootKeyframe[];
}
