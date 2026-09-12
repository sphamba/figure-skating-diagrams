import type { PathCoordinate } from "../coordinates.js";
import { halfFeetSpacing, offIceFootHeight } from "./glide.js";
import { turnDirections, turnSides } from "./oneFootTurn.js";
import { FootKeyframe, type FootData, HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import { FootTurn } from "./turn.js";
import type { FootKey } from "../sequence.js";

export type TwoFeetTurnFlags = { left: boolean; forward: boolean; closed: boolean };

export const turnOpenness = [
  ["Open", false],
  ["Closed", true],
] as const;

export abstract class TwoFeetTurn extends FootTurn {
  readonly closed: boolean;

  constructor(footKey: FootKey, flags: TwoFeetTurnFlags, start: PathCoordinate, end: PathCoordinate) {
    super(footKey, { left: flags.left, forward: flags.forward, inside: false }, start, end);
    this.closed = flags.closed;
  }

  get clockwise(): boolean {
    return this.left === this.forward;
  }

  protected get initialAngle(): number {
    return this.forward ? 0 : Math.PI;
  }

  protected get finalAngle(): number {
    return this.initialAngle + Math.PI;
  }

  protected get rotationSign(): number {
    return this.clockwise ? -1 : 1;
  }

  // Foot orientations at the midpoint, relative to the path frame: [foot A, foot B]
  protected abstract midpointFootAngles(): [number, number];

  // Foot position offsets at the midpoint, rotated by each foot's own orientation
  // to give world placement: [foot A, foot B]
  protected abstract midpointFootPositions(spacing: number): [Vector<3>, Vector<3>];

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

  // Foot A starts on ice and ends off ice; foot B starts off ice and ends on ice.
  private partFootKeyframes(footKey: FootKey, spanScale?: number, lateralScale?: number): FootKeyframe[] {
    const [start, end] = this.keyframeSpan(spanScale);
    return footKey === this.footKey
      ? this.createOnIceFootKeyframes(start, end, lateralScale)
      : this.createFreeFootKeyframes(start, end, lateralScale);
  }

  protected createOnIceFootKeyframes(
    start: PathCoordinate,
    end: PathCoordinate,
    lateralScale?: number,
  ): FootKeyframe[] {
    const middle = ((start + end) / 2) as PathCoordinate;
    const spacing = halfFeetSpacing * (lateralScale ?? 1);
    const [midAngle, _midAngleB] = this.midpointFootAngles();
    const [positionA] = this.midpointFootPositions(spacing);
    const onIceData: FootData = {
      position: new Vector<3>(0, 0, 0),
      orientation: getQuaternionFromAngleAxis(this.initialAngle),
      contactPoint: 0.5,
      toePick: false,
    };
    const midData: FootData = {
      position: positionA,
      orientation: getQuaternionFromAngleAxis(midAngle),
      contactPoint: 0.5,
      toePick: false,
    };
    const scale = lateralScale ?? 1;
    const ownSide = (this.footKey === "footL" ? halfFeetSpacing : -halfFeetSpacing) * scale;
    const freeFootData: FootData = {
      position: new Vector<3>(0, ownSide, offIceFootHeight),
      orientation: getQuaternionFromAngleAxis(this.finalAngle),
      contactPoint: 0.5,
      toePick: false,
    };
    const coordinates = [start, middle, end];
    const data = [onIceData, midData, freeFootData];
    return coordinates.map((coordinate, index) => {
      return new FootKeyframe(
        coordinate,
        data[index]!,
        index === 2 ? "smooth" : "linear",
        index === 0 ? "smooth" : "linear",
      );
    });
  }

  protected createFreeFootKeyframes(start: PathCoordinate, end: PathCoordinate, lateralScale?: number): FootKeyframe[] {
    const middle = ((start + end) / 2) as PathCoordinate;
    const spacing = halfFeetSpacing * (lateralScale ?? 1);
    const [, midAngle] = this.midpointFootAngles();
    const [, positionB] = this.midpointFootPositions(spacing);
    const scale = lateralScale ?? 1;
    const freeSide = (this.footKey === "footL" ? -halfFeetSpacing : halfFeetSpacing) * scale;
    const freeFootData: FootData = {
      position: new Vector<3>(0, freeSide, offIceFootHeight),
      orientation: getQuaternionFromAngleAxis(this.initialAngle),
      contactPoint: 0.5,
      toePick: false,
    };
    const midData: FootData = {
      position: positionB,
      orientation: getQuaternionFromAngleAxis(midAngle),
      contactPoint: 0.5,
      toePick: false,
    };
    const onIceData: FootData = {
      position: new Vector<3>(0, 0, 0),
      orientation: getQuaternionFromAngleAxis(this.finalAngle),
      contactPoint: 0.5,
      toePick: false,
    };
    const coordinates = [start, middle, end];
    const data = [freeFootData, midData, onIceData];
    return coordinates.map((coordinate, index) => {
      return new FootKeyframe(
        coordinate,
        data[index]!,
        index === 2 ? "smooth" : "linear",
        index === 0 ? "smooth" : "linear",
      );
    });
  }

  protected createHipsKeyframes(start: PathCoordinate, end: PathCoordinate): HipsKeyframe[] {
    const middle = ((start + end) / 2) as PathCoordinate;
    const angles = [
      this.initialAngle,
      this.initialAngle + (this.rotationSign * Math.PI) / 2,
      this.initialAngle + this.rotationSign * Math.PI,
    ];
    const coordinates = [start, middle, end];
    return angles.map((angle, index) => {
      const data = { position: new Vector<3>(0, 0, 0), orientation: getQuaternionFromAngleAxis(angle) };
      return new HipsKeyframe(
        coordinates[index]!,
        data,
        index === 1 ? "linear" : "smooth",
        index === 1 ? "linear" : "smooth",
      );
    });
  }
}

export interface TwoFeetTurnKindSpec {
  suffix: string;
  label: string;
  shortName: (flags: TwoFeetTurnFlags) => string;
}

export function defineTwoFeetTurnKinds(
  spec: TwoFeetTurnKindSpec,
  defineVariant: (type: string, shortName: string, flags: TwoFeetTurnFlags) => void,
): { type: string; label: string }[] {
  const kindChoices: { type: string; label: string }[] = [];
  for (const [side, left] of turnSides) {
    for (const [direction, forward] of turnDirections) {
      for (const [opennessName, closed] of turnOpenness) {
        const type = `${side}${direction}${opennessName}${spec.suffix}`;
        const flags: TwoFeetTurnFlags = { left, forward, closed };
        defineVariant(type, spec.shortName(flags), flags);
        kindChoices.push({
          type,
          label: `${side} ${direction.toLowerCase()} ${opennessName.toLowerCase()} ${spec.label}`,
        });
      }
    }
  }
  return kindChoices;
}
