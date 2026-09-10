/* Loops: a full turn on one foot, with 8 left/forward/inside variants
 * generated from side, direction and edge flags. */

import { bladeLength } from "../constants.js";
import type { PathCoordinate } from "../coordinates.js";
import { FootKeyframe, type FootData, HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import { OneFootTurn } from "./oneFootTurn.js";
import type { FootKey } from "../sequence.js";

/** Constructor type of a generated loop variant. */
export type LoopConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => Loop;

// Hardcoded loop shift: to have the loop length equal 1.5 * bladeLength
const defaultLoopShift = (bladeLength * 1.5) as PathCoordinate;

/**
 * A Loop is a full turn on one foot: the on-ice foot rotates a whole turn
 * around a point of the centerline at the center of the element. The foot
 * shifts sideways in the middle of the turn and comes back to the centerline
 * at both ends of the element.
 */
export abstract class Loop extends OneFootTurn {
  protected get initialAngle(): number {
    return this.forward ? 0 : Math.PI;
  }

  protected get angleIncrement(): number {
    return this.clockwise ? -Math.PI : Math.PI;
  }

  protected get contactPointTurn(): number {
    return this.forward ? 0 : 1;
  }

  /** Hips keyframes: the hips rotate the whole turn of the loop, like the
   * on-ice foot, at the start, the center and the end of the element. */
  protected createHipsKeyframes(start: PathCoordinate, end: PathCoordinate): HipsKeyframe[] {
    const pathCoordinate = ((start + end) / 2) as PathCoordinate;
    const coordinates = [start, pathCoordinate, end];

    const keyframes: HipsKeyframe[] = [];
    for (let i = 0; i < 3; i++) {
      const angle = this.initialAngle + i * this.angleIncrement;
      const keyframeData = {
        position: new Vector<3>(0, 0, 0),
        orientation: getQuaternionFromAngleAxis(angle),
      };

      const keyframe = new HipsKeyframe(
        coordinates[i]!,
        keyframeData,
        // Hardcoded smooth entry and exit in and out of the turn
        i != 1 ? "smooth" : "linear",
        i != 1 ? "smooth" : "linear",
      );
      keyframes.push(keyframe);
    }
    return keyframes;
  }

  createOnIceFootKeyframes(start: PathCoordinate, end: PathCoordinate, lateralScale?: number): FootKeyframe[] {
    const pathCoordinate = ((start + end) / 2) as PathCoordinate;
    const scale = lateralScale ?? 1;
    const lateralShift = (this.clockwise ? 1 : -1) * (this.forward ? 1 : -1) * defaultLoopShift * scale;
    const pathLengthEntry = (pathCoordinate - start) as PathCoordinate;
    const pathLengthExit = (end - pathCoordinate) as PathCoordinate;
    const pathCoordinateShifts = [-pathLengthEntry, 0, pathLengthExit];
    const pathCoordinates = pathCoordinateShifts.map(
      (pathCoordinateShift) => (pathCoordinate + pathCoordinateShift) as PathCoordinate,
    );
    const contactPoints = [0.5, this.contactPointTurn, 0.5];
    // No shift relative to the centerline at the start and the end of the
    // turn; the shift happens in the middle of the turn only.
    const positions = [
      new Vector<3>(0, 0, 0),
      new Vector<3>((0.5 - this.contactPointTurn) * bladeLength, lateralShift, 0),
      new Vector<3>(0, 0, 0),
    ];

    const keyframes: FootKeyframe[] = [];
    for (let i = 0; i < 3; i++) {
      const pathCoordinate = pathCoordinates[i]!;
      const angle = this.initialAngle + i * this.angleIncrement;
      const contactPoint = contactPoints[i];

      const keyframeData: FootData = {
        orientation: getQuaternionFromAngleAxis(angle),
        contactPoint: contactPoint,
        position: positions[i],
      };

      const keyframe = new FootKeyframe(
        pathCoordinate,
        keyframeData,
        // Hardcoded smooth entry and exit in and out of the turn
        i != 1 ? "smooth" : "linear",
        i != 1 ? "smooth" : "linear",
      );

      keyframes.push(keyframe);
    }
    return keyframes;
  }
}

/** Map a loop type name to its constructor, for the turn registry. */
export const loopConstructorsByType: Record<string, LoopConstructor> = {};

/** Define one loop variant class: the flags close over the subclass, which
 * registers itself into the type registry. */
function defineLoop(type: string, flags: { left: boolean; forward: boolean; inside: boolean }): LoopConstructor {
  const Variant = class extends Loop {
    constructor(footKey: FootKey, start: PathCoordinate, end: PathCoordinate) {
      super(footKey, flags, start, end);
    }

    get type(): string {
      return type;
    }
  };
  loopConstructorsByType[type] = Variant;
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

/** Human-readable label for each available loop kind. */
export const loopKindChoices: { type: string; label: string }[] = [];

/** Construct the left/forward/inside variants from the name flags. */
for (const [side, left] of turnSides) {
  for (const [direction, forward] of turnDirections) {
    for (const [edge, inside] of turnEdges) {
      const type = `${side}${direction}${edge}Loop`;
      defineLoop(type, { left, forward, inside });
      loopKindChoices.push({ type, label: `${side} ${direction.toLowerCase()} ${edge.toLowerCase()} loop` });
    }
  }
}

/** Named constructors kept for use outside the registry (sequences, tests). */
export const LeftForwardInsideLoop = loopConstructorsByType["LeftForwardInsideLoop"]!;
export const LeftForwardOutsideLoop = loopConstructorsByType["LeftForwardOutsideLoop"]!;
export const LeftBackwardInsideLoop = loopConstructorsByType["LeftBackwardInsideLoop"]!;
export const LeftBackwardOutsideLoop = loopConstructorsByType["LeftBackwardOutsideLoop"]!;
export const RightForwardInsideLoop = loopConstructorsByType["RightForwardInsideLoop"]!;
export const RightForwardOutsideLoop = loopConstructorsByType["RightForwardOutsideLoop"]!;
export const RightBackwardInsideLoop = loopConstructorsByType["RightBackwardInsideLoop"]!;
export const RightBackwardOutsideLoop = loopConstructorsByType["RightBackwardOutsideLoop"]!;
