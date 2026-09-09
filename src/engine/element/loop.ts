/* Loops: a full turn on one foot, with 8 left/forward/inside variants. */

import { bladeLength } from "../constants.js";
import type { PathCoordinate } from "../coordinates.js";
import { FootKeyframe, type FootData, HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import { OneFootTurn } from "./oneFootTurn.js";
import type { FootTurnClass, FootTurnJSON } from "./turn.js";
import type { FootKey } from "../sequence.js";

// Hardcoded loop shift: to have the loop length equal 1.5 * bladeLength
const defaultLoopShift = (bladeLength * 1.5) as PathCoordinate;

/**
 * A Loop is a full turn on one foot: the on-ice foot rotates a whole turn
 * around a point of the centerline at the center of the element. The foot
 * shifts sideways in the middle of the turn and comes back to the centerline
 * at both ends of the element.
 */
export abstract class Loop extends OneFootTurn {
  constructor(footKey: FootKey, start: PathCoordinate, end: PathCoordinate) {
    super(footKey, start, end);
  }

  protected get initialAngle(): number {
    return this.forward ? 0 : Math.PI;
  }

  protected get angleIncrement(): number {
    return this.clockwise ? -Math.PI : Math.PI;
  }

  protected get contactPointTurn(): number {
    return this.forward ? 0 : 1;
  }

  toJSON(): FootTurnJSON {
    return super.toJSON();
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

  createOnIceFootKeyframes(start: PathCoordinate, end: PathCoordinate): FootKeyframe[] {
    const pathCoordinate = ((start + end) / 2) as PathCoordinate;
    const pathLengthEntry = (pathCoordinate - start) as PathCoordinate;
    const pathLengthExit = (end - pathCoordinate) as PathCoordinate;
    const pathCoordinateShifts = [-pathLengthEntry, 0, pathLengthExit];
    const pathCoordinates = pathCoordinateShifts.map(
      (pathCoordinateShift) => (pathCoordinate + pathCoordinateShift) as PathCoordinate,
    );
    const contactPoints = [0.5, this.contactPointTurn, 0.5];
    const lateralShift = (this.clockwise ? 1 : -1) * (this.forward ? 1 : -1) * defaultLoopShift;
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

export class LeftForwardInsideLoop extends Loop {
  get left(): boolean {
    return true;
  }

  get forward(): boolean {
    return true;
  }

  get inside(): boolean {
    return true;
  }

  get type(): string {
    return "LeftForwardInsideLoop";
  }
}

export class LeftForwardOutsideLoop extends Loop {
  get left(): boolean {
    return true;
  }

  get forward(): boolean {
    return true;
  }

  get inside(): boolean {
    return false;
  }

  get type(): string {
    return "LeftForwardOutsideLoop";
  }
}

export class LeftBackwardInsideLoop extends Loop {
  get left(): boolean {
    return true;
  }

  get forward(): boolean {
    return false;
  }

  get inside(): boolean {
    return true;
  }

  get type(): string {
    return "LeftBackwardInsideLoop";
  }
}

export class LeftBackwardOutsideLoop extends Loop {
  get left(): boolean {
    return true;
  }

  get forward(): boolean {
    return false;
  }

  get inside(): boolean {
    return false;
  }

  get type(): string {
    return "LeftBackwardOutsideLoop";
  }
}

export class RightForwardInsideLoop extends Loop {
  get left(): boolean {
    return false;
  }

  get forward(): boolean {
    return true;
  }

  get inside(): boolean {
    return true;
  }

  get type(): string {
    return "RightForwardInsideLoop";
  }
}

export class RightForwardOutsideLoop extends Loop {
  get left(): boolean {
    return false;
  }

  get forward(): boolean {
    return true;
  }

  get inside(): boolean {
    return false;
  }

  get type(): string {
    return "RightForwardOutsideLoop";
  }
}

export class RightBackwardInsideLoop extends Loop {
  get left(): boolean {
    return false;
  }

  get forward(): boolean {
    return false;
  }

  get inside(): boolean {
    return true;
  }

  get type(): string {
    return "RightBackwardInsideLoop";
  }
}

export class RightBackwardOutsideLoop extends Loop {
  get left(): boolean {
    return false;
  }

  get forward(): boolean {
    return false;
  }

  get inside(): boolean {
    return false;
  }

  get type(): string {
    return "RightBackwardOutsideLoop";
  }
}

/** Map a loop type name to its constructor, for the turn registry. */
export const loopConstructorsByType: Record<string, FootTurnClass> = {
  LeftForwardInsideLoop,
  LeftForwardOutsideLoop,
  LeftBackwardInsideLoop,
  LeftBackwardOutsideLoop,
  RightForwardInsideLoop,
  RightForwardOutsideLoop,
  RightBackwardInsideLoop,
  RightBackwardOutsideLoop,
};
