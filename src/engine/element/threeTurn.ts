/* Three-turns: a half turn on one foot, with 8 left/forward/inside variants. */

import type { PathCoordinate } from "../coordinates.js";
import { FootKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import { OneFootTurn } from "./oneFootTurn.js";
import type { FootTurnClass } from "./turn.js";

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

export class LeftForwardInsideThreeTurn extends ThreeTurn {
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
    return "LeftForwardInsideThreeTurn";
  }
}

export class LeftForwardOutsideThreeTurn extends ThreeTurn {
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
    return "LeftForwardOutsideThreeTurn";
  }
}

export class LeftBackwardInsideThreeTurn extends ThreeTurn {
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
    return "LeftBackwardInsideThreeTurn";
  }
}

export class LeftBackwardOutsideThreeTurn extends ThreeTurn {
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
    return "LeftBackwardOutsideThreeTurn";
  }
}

export class RightForwardInsideThreeTurn extends ThreeTurn {
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
    return "RightForwardInsideThreeTurn";
  }
}

export class RightForwardOutsideThreeTurn extends ThreeTurn {
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
    return "RightForwardOutsideThreeTurn";
  }
}

export class RightBackwardInsideThreeTurn extends ThreeTurn {
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
    return "RightBackwardInsideThreeTurn";
  }
}

export class RightBackwardOutsideThreeTurn extends ThreeTurn {
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
    return "RightBackwardOutsideThreeTurn";
  }
}

/** Map a three-turn type name to its constructor, for the turn registry. */
export const threeTurnConstructorsByType: Record<string, FootTurnClass> = {
  LeftForwardInsideThreeTurn,
  LeftForwardOutsideThreeTurn,
  LeftBackwardInsideThreeTurn,
  LeftBackwardOutsideThreeTurn,
  RightForwardInsideThreeTurn,
  RightForwardOutsideThreeTurn,
  RightBackwardInsideThreeTurn,
  RightBackwardOutsideThreeTurn,
};
