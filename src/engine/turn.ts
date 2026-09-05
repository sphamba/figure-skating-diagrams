/* Set of 3 keyframes to define a turn */

import { bladeLength } from "./constants.js";
import type { PathCoordinate } from "./coordinates.js";
import { Element } from "./element.js";
import { type FootData, FootKeyframe, type HipsKeyframe } from "./keyframe.js";
import { getQuaternionFromAngleAxis } from "./quaternion.js";
import type { FootKey } from "./sequence.js";
import { Vector } from "./vector.js";

// Arbitrary, depends on interpolation functions
const defaultPathLengthSmooth = (bladeLength * 1.6) as PathCoordinate;
// To have loop length equal to 1.5 * bladeLength
const defaultLoopShift = (bladeLength * 0.9) as PathCoordinate;

export abstract class FootTurn extends Element {
  footKey: FootKey;
  smoothEntry: boolean;
  smoothExit: boolean;
  abstract readonly clockwise: boolean;
  abstract readonly initialAngle: number;
  abstract readonly angleIncrement: number;
  abstract readonly contactPointTurn: number;

  constructor(
    footKey: FootKey,
    start: PathCoordinate,
    end: PathCoordinate,
    smoothEntry: boolean = true,
    smoothExit: boolean = true,
  ) {
    super(start, end);
    this.footKey = footKey;
    this.smoothEntry = smoothEntry;
    this.smoothExit = smoothExit;
  }

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

  /** The turn is performed on the skating foot. The free foot has no keyframes. */
  getLeftFootKeyframes(): FootKeyframe[] {
    return this.footKey === "footL" ? this.createKeyframes() : [];
  }

  getRightFootKeyframes(): FootKeyframe[] {
    return this.footKey === "footR" ? this.createKeyframes() : [];
  }

  getHipsKeyframes(): HipsKeyframe[] {
    return [];
  }

  /** Compute the turn keyframes from the element's start and end coordinates. */
  protected abstract createKeyframes(): FootKeyframe[];
}

export type FootTurnConstructor = new (
  footKey: FootKey,
  start: PathCoordinate,
  end: PathCoordinate,
  smoothEntry?: boolean,
  smoothExit?: boolean,
) => FootTurn;

abstract class FootHalfTurn extends FootTurn {
  abstract readonly forward: boolean;

  get initialAngle(): number {
    return this.forward ? 0 : Math.PI;
  }

  get angleIncrement(): number {
    return this.clockwise ? -Math.PI / 2 : Math.PI / 2;
  }

  get contactPointTurn(): number {
    return this.forward ? 1 : 0;
  }

  createKeyframes(): FootKeyframe[] {
    const pathCoordinateShifts = [-this.pathLengthEntry, 0, this.pathLengthExit];
    const pathCoordinates = pathCoordinateShifts.map(
      (pathCoordinateShift) => (this.pathCoordinate + pathCoordinateShift) as PathCoordinate,
    );

    const keyframes: FootKeyframe[] = [];
    for (let i = 0; i < 3; i++) {
      const pathCoordinate = pathCoordinates[i]!;
      const angle = this.initialAngle + i * this.angleIncrement;
      const contactPoint = i == 1 ? this.contactPointTurn : 0.5;

      const keyframeData = {
        orientation: getQuaternionFromAngleAxis(angle),
        contactPoint: contactPoint,
      };

      const keyframe = new FootKeyframe(
        pathCoordinate,
        keyframeData,
        // Smooth entry and exit into the turn
        this.smoothExit && i == 2 ? "smooth" : "linear",
        this.smoothEntry && i == 0 ? "smooth" : "linear",
      );

      keyframes.push(keyframe);
    }
    return keyframes;
  }
}

export class ForwardClockwiseFootTurn extends FootHalfTurn {
  get forward(): boolean {
    return true;
  }

  get clockwise(): boolean {
    return true;
  }
}

export class ForwardCounterClockwiseFootTurn extends FootHalfTurn {
  get forward(): boolean {
    return true;
  }

  get clockwise(): boolean {
    return false;
  }
}

export class BackwardClockwiseFootTurn extends FootHalfTurn {
  get forward(): boolean {
    return false;
  }

  get clockwise(): boolean {
    return true;
  }
}

export class BackwardCounterClockwiseFootTurn extends FootHalfTurn {
  get forward(): boolean {
    return false;
  }

  get clockwise(): boolean {
    return false;
  }
}

abstract class FootLoop extends FootTurn {
  abstract readonly forward: boolean;
  loopShift: PathCoordinate;

  constructor(
    footKey: FootKey,
    start: PathCoordinate,
    end: PathCoordinate,
    smoothEntry: boolean = true,
    smoothExit: boolean = true,
    loopShift?: PathCoordinate,
  ) {
    super(footKey, start, end, smoothEntry, smoothExit);
    this.loopShift = loopShift ?? defaultLoopShift;
  }

  get initialAngle(): number {
    return this.forward ? 0 : Math.PI;
  }

  get angleIncrement(): number {
    return this.clockwise ? -Math.PI : Math.PI;
  }

  get contactPointTurn(): number {
    return this.forward ? 0 : 1;
  }

  createKeyframes(): FootKeyframe[] {
    if (!this.loopShift) return [];

    const pathCoordinateShifts = [-this.pathLengthEntry, 0, this.pathLengthExit];
    const pathCoordinates = pathCoordinateShifts.map(
      (pathCoordinateShift) => (this.pathCoordinate + pathCoordinateShift) as PathCoordinate,
    );
    const contactPoints = [0.5, this.contactPointTurn, 0.5];
    const lateralShift = (this.clockwise ? 1 : -1) * (this.forward ? 1 : -1) * this.loopShift;
    const positions = [
      new Vector<3>(0, lateralShift, 0),
      new Vector<3>((0.5 - this.contactPointTurn) * bladeLength, lateralShift, 0),
      new Vector<3>(0, lateralShift, 0),
    ];

    const keyframes: FootKeyframe[] = [];
    for (let i = 0; i < 3; i++) {
      const pathCoordinate = pathCoordinates[i]!;
      const angle = this.initialAngle + i * this.angleIncrement;
      const contactPoint = contactPoints[i];

      const keyframeData: FootData = {
        orientation: getQuaternionFromAngleAxis(angle),
        contactPoint: contactPoint,
      };

      const position = positions[i];
      if (position) {
        keyframeData.position = position;
      }

      const keyframe = new FootKeyframe(
        pathCoordinate,
        keyframeData,
        // Smooth entry and exit into the turn
        this.smoothExit && i != 1 ? "smooth" : "linear",
        this.smoothEntry && i != 1 ? "smooth" : "linear",
      );

      keyframes.push(keyframe);
    }
    return keyframes;
  }
}

export class ForwardClockwiseFootLoop extends FootLoop {
  get forward(): boolean {
    return true;
  }

  get clockwise(): boolean {
    return true;
  }
}

export class ForwardCounterClockwiseFootLoop extends FootLoop {
  get forward(): boolean {
    return true;
  }

  get clockwise(): boolean {
    return false;
  }
}

export class BackwardClockwiseFootLoop extends FootLoop {
  get forward(): boolean {
    return false;
  }

  get clockwise(): boolean {
    return true;
  }
}

export class BackwardCounterClockwiseFootLoop extends FootLoop {
  get forward(): boolean {
    return false;
  }

  get clockwise(): boolean {
    return false;
  }
}

/** Default length of the smooth entry/exit portion of a turn, in path units. */
export const defaultFootTurnLength = defaultPathLengthSmooth;
