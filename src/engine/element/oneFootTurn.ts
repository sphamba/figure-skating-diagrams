import type { PathCoordinate } from "../coordinates.js";
import { halfFeetSpacing, offIceFootHeight } from "./glide.js";
import { type FootData, FootKeyframe, HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import { FootTurn } from "./turn.js";

export abstract class OneFootTurn extends FootTurn {
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

  private partFootKeyframes(footKey: "footL" | "footR", spanScale?: number, lateralScale?: number): FootKeyframe[] {
    const [start, end] = this.keyframeSpan(spanScale);
    return footKey === this.footKey
      ? this.createOnIceFootKeyframes(start, end, lateralScale)
      : this.createFreeFootKeyframes(start, end, lateralScale);
  }

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

  protected createHipsKeyframes(start: PathCoordinate, end: PathCoordinate): HipsKeyframe[] {
    const data = {
      position: new Vector<3>(0, 0, 0),
      orientation: getQuaternionFromAngleAxis(this.forward ? 0 : Math.PI),
    };
    return [new HipsKeyframe(start, data, "smooth", "smooth"), new HipsKeyframe(end, data, "smooth", "smooth")];
  }

  protected abstract createOnIceFootKeyframes(
    start: PathCoordinate,
    end: PathCoordinate,
    lateralScale?: number,
  ): FootKeyframe[];
}
