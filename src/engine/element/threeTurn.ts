import type { PathCoordinate } from "../coordinates.js";
import { FootKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import type { FootKey } from "../sequence.js";
import { OneFootTurn } from "./oneFootTurn.js";

export abstract class ThreeTurn extends OneFootTurn {
  protected get initialAngle(): number {
    return this.forward ? 0 : Math.PI;
  }

  protected get angleIncrement(): number {
    return this.clockwise ? -Math.PI / 2 : Math.PI / 2;
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

export type ThreeTurnConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => ThreeTurn;

export const threeTurnConstructorsByType: Record<string, ThreeTurnConstructor> = {};

function defineThreeTurn(
  type: string,
  shortName: string,
  flags: { left: boolean; forward: boolean; inside: boolean },
): ThreeTurnConstructor {
  const Variant = class extends ThreeTurn {
    constructor(footKey: FootKey, start: PathCoordinate, end: PathCoordinate) {
      super(footKey, flags, start, end);
    }

    get type(): string {
      return type;
    }

    get shortName(): string {
      return shortName;
    }
  };
  threeTurnConstructorsByType[type] = Variant;
  return Variant;
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

export const threeTurnKindChoices: { type: string; label: string }[] = [];

for (const [side, left] of turnSides) {
  for (const [direction, forward] of turnDirections) {
    for (const [edge, inside] of turnEdges) {
      const type = `${side}${direction}${edge}ThreeTurn`;
      const shortName = `${side[0]}${direction[0]}${edge[0]}3`;
      defineThreeTurn(type, shortName, { left, forward, inside });
      threeTurnKindChoices.push({
        type,
        label: `${side} ${direction.toLowerCase()} ${edge.toLowerCase()} three-turn`,
      });
    }
  }
}

export const LeftForwardInsideThreeTurn = threeTurnConstructorsByType["LeftForwardInsideThreeTurn"]!;
export const LeftForwardOutsideThreeTurn = threeTurnConstructorsByType["LeftForwardOutsideThreeTurn"]!;
export const LeftBackwardInsideThreeTurn = threeTurnConstructorsByType["LeftBackwardInsideThreeTurn"]!;
export const LeftBackwardOutsideThreeTurn = threeTurnConstructorsByType["LeftBackwardOutsideThreeTurn"]!;
export const RightForwardInsideThreeTurn = threeTurnConstructorsByType["RightForwardInsideThreeTurn"]!;
export const RightForwardOutsideThreeTurn = threeTurnConstructorsByType["RightForwardOutsideThreeTurn"]!;
export const RightBackwardInsideThreeTurn = threeTurnConstructorsByType["RightBackwardInsideThreeTurn"]!;
export const RightBackwardOutsideThreeTurn = threeTurnConstructorsByType["RightBackwardOutsideThreeTurn"]!;
