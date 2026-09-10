/* Three-turns: a half turn on one foot, with 8 left/forward/inside variants
 * generated from side, direction and edge flags. */

import type { PathCoordinate } from "../coordinates.js";
import { FootKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import type { FootKey } from "../sequence.js";
import { OneFootTurn } from "./oneFootTurn.js";

/**
 * A ThreeTurn is a half turn on one foot: the on-ice foot rotates by a
 * quarter turn at the center of the element and swaps its edge (an inside
 * edge becomes an outside edge and the other way round).
 */
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

      // No shift relative to the centerline, including at the turn center.
      const keyframeData = {
        position: new Vector<3>(0, 0, 0),
        orientation: getQuaternionFromAngleAxis(angle),
        contactPoint: contactPoint,
      };

      const keyframe = new FootKeyframe(
        pathCoordinate,
        keyframeData,
        // Hardcoded smooth exit out of the turn
        i == 2 ? "smooth" : "linear",
        // Hardcoded smooth entry into the turn
        i == 0 ? "smooth" : "linear",
      );

      keyframes.push(keyframe);
    }
    return keyframes;
  }
}

/** Constructor type of a generated three-turn variant. */
export type ThreeTurnConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => ThreeTurn;

/** Map a three-turn type name to its constructor, for the turn registry. */
export const threeTurnConstructorsByType: Record<string, ThreeTurnConstructor> = {};

/** Define one three-turn variant class: the flags close over the subclass,
 * which registers itself into the type registry. */
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

/** The side, direction and edge words of each variant name, with their flag. */
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

/** Human-readable label for each available three-turn kind. */
export const threeTurnKindChoices: { type: string; label: string }[] = [];

/** Construct the left/forward/inside variants from the name flags. */
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

/** Named constructors kept for use outside the registry (sequences, tests). */
export const LeftForwardInsideThreeTurn = threeTurnConstructorsByType["LeftForwardInsideThreeTurn"]!;
export const LeftForwardOutsideThreeTurn = threeTurnConstructorsByType["LeftForwardOutsideThreeTurn"]!;
export const LeftBackwardInsideThreeTurn = threeTurnConstructorsByType["LeftBackwardInsideThreeTurn"]!;
export const LeftBackwardOutsideThreeTurn = threeTurnConstructorsByType["LeftBackwardOutsideThreeTurn"]!;
export const RightForwardInsideThreeTurn = threeTurnConstructorsByType["RightForwardInsideThreeTurn"]!;
export const RightForwardOutsideThreeTurn = threeTurnConstructorsByType["RightForwardOutsideThreeTurn"]!;
export const RightBackwardInsideThreeTurn = threeTurnConstructorsByType["RightBackwardInsideThreeTurn"]!;
export const RightBackwardOutsideThreeTurn = threeTurnConstructorsByType["RightBackwardOutsideThreeTurn"]!;
