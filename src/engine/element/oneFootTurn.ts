import type { PathCoordinate } from "../coordinates.js";
import { halfFeetSpacing, offIceFootHeight } from "./glide.js";
import { type FootData, FootKeyframe, HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import { FootTurn, type FootTurnFlags } from "./turn.js";

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

const turnSides = [
  ["Left", true],
  ["Right", false],
] as const;
const turnDirections = [
  ["Forward", true],
  ["Backward", false],
] as const;
const turnEdges = [
  ["Inside", true],
  ["Outside", false],
] as const;

export interface OneFootTurnKindSpec {
  suffix: string;
  shortSuffix: string;
  label: string;
}

export function defineOneFootTurnKinds(
  spec: OneFootTurnKindSpec,
  defineVariant: (type: string, shortName: string, flags: FootTurnFlags) => void,
): { type: string; label: string }[] {
  const kindChoices: { type: string; label: string }[] = [];
  for (const [side, left] of turnSides) {
    for (const [direction, forward] of turnDirections) {
      for (const [edge, inside] of turnEdges) {
        const type = `${side}${direction}${edge}${spec.suffix}`;
        const shortName = `${side[0]}${direction[0]}${edge[0]}${spec.shortSuffix}`;
        defineVariant(type, shortName, { left, forward, inside });
        kindChoices.push({ type, label: `${side} ${direction.toLowerCase()} ${edge.toLowerCase()} ${spec.label}` });
      }
    }
  }
  return kindChoices;
}

export abstract class EdgeTurn extends OneFootTurn {
  protected abstract get counterRotated(): boolean;

  protected get initialAngle(): number {
    return this.forward ? 0 : Math.PI;
  }

  protected get angleIncrement(): number {
    const sign = (this.clockwise ? -1 : 1) * (this.counterRotated ? -1 : 1);
    return (sign * Math.PI) / 2;
  }

  protected get contactPointTurn(): number {
    return this.forward ? 1 : 0;
  }

  createOnIceFootKeyframes(start: PathCoordinate, end: PathCoordinate, _lateralScale?: number): FootKeyframe[] {
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
        position: new Vector<3>(0, 0, 0),
        orientation: getQuaternionFromAngleAxis(angle),
        contactPoint: contactPoint,
      };

      const keyframe = new FootKeyframe(
        pathCoordinate,
        keyframeData,
        i == 2 ? "smooth" : "linear",
        i == 0 ? "smooth" : "linear",
      );

      keyframes.push(keyframe);
    }
    return keyframes;
  }
}
