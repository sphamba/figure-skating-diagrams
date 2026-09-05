//* Set of 3 keyframes to define a turn */

import { bladeLength } from "./constants.js";
import type { PathCoordinate } from "./coordinates.js";
import { type FootData, FootKeyframe } from "./keyframe.js";
import { getQuaternionFromAngleAxis } from "./quaternion.js";
import { Vector } from "./vector.js";

// Arbitrary, depends on interpolation functions
const defaultPathLengthSmooth = bladeLength * 1.6 as PathCoordinate;
const defaultPathLengthLinear = bladeLength * 0.8 as PathCoordinate;
// To have loop length equal to 1.5 * bladeLength
const defaultLoopShift = bladeLength * 0.9 as PathCoordinate;

export abstract class FootTurn {
  pathCoordinate: PathCoordinate;
  smoothEntry: boolean;
  smoothExit: boolean;
  pathLengthEntry: PathCoordinate;
  pathLengthExit: PathCoordinate;
  keyframes: FootKeyframe[];
  abstract readonly clockwise: boolean;
  abstract readonly initialAngle: number;
  abstract readonly angleIncrement: number;
  abstract readonly contactPointTurn: number;

  constructor(
    pathCoordinate: PathCoordinate,
    smoothEntry: boolean = true,
    smoothExit: boolean = true,
    pathLengthEntry?: PathCoordinate,
    pathLengthExit?: PathCoordinate,
  ) {
    this.pathCoordinate = pathCoordinate;
    this.smoothEntry = smoothEntry;
    this.smoothExit = smoothExit;
    this.pathLengthEntry = pathLengthEntry ?? (smoothEntry ? defaultPathLengthSmooth : defaultPathLengthLinear);
    this.pathLengthExit = pathLengthExit ?? (smoothExit ? defaultPathLengthSmooth : defaultPathLengthLinear);
    this.keyframes = [];
  }

  abstract createKeyframes(): void;
}

export type FootTurnConstructor = new (...args: any[]) => FootTurn;

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

  createKeyframes() {
    this.keyframes = [];
    const pathCoordinateShifts = [-this.pathLengthEntry, 0, this.pathLengthExit];
    const pathCoordinates = pathCoordinateShifts.map(
      (pathCoordinateShift) => (this.pathCoordinate + pathCoordinateShift) as PathCoordinate,
    );

    for (let i = 0; i < 3; i++) {
      const pathCoordinate = pathCoordinates[i];
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

      this.keyframes.push(keyframe);
    }
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
    pathCoordinate: PathCoordinate,
    smoothEntry: boolean = true,
    smoothExit: boolean = true,
    pathLengthEntry?: PathCoordinate,
    pathLengthExit?: PathCoordinate,
    loopShift?: PathCoordinate,
  ) {
    super(pathCoordinate, smoothEntry, smoothExit, pathLengthEntry, pathLengthExit);
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

  createKeyframes() {
    if (!this.loopShift) return;

    this.keyframes = [];
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

    for (let i = 0; i < 3; i++) {
      const pathCoordinate = pathCoordinates[i];
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

      this.keyframes.push(keyframe);
    }
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
