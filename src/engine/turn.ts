//* Set of 3 keyframes to define a turn */

import { bladeLength } from "./constants.js";
import { type FootData, FootKeyframe } from "./keyframe.js";
import { getQuaternionFromAngleAxis } from "./quaternion.js";
import { Sequence } from "./sequence.js";
import { Vector } from "./vector.js";

// Arbitrary, depends on interpolation functions
const defaultPathLengthSmooth = bladeLength * 1.6;
const defaultPathLengthLinear = bladeLength * 0.8;
// To have loop length equal to 1.5 * bladeLength
const defaultLoopShift = bladeLength * 0.9;

export abstract class FootTurn {
  pathCoordinate: number;
  smoothEntry: boolean;
  smoothExit: boolean;
  pathLengthEntry: number;
  pathLengthExit: number;
  keyframes: FootKeyframe[];
  abstract readonly clockwise: boolean;
  abstract readonly initialAngle: number;
  abstract readonly angleIncrement: number;
  abstract readonly contactPointTurn: number;

  constructor(
    pathCoordinate: number,
    smoothEntry: boolean = true,
    smoothExit: boolean = true,
    pathLengthEntry?: number,
    pathLengthExit?: number,
  ) {
    this.pathCoordinate = pathCoordinate;
    this.smoothEntry = smoothEntry;
    this.smoothExit = smoothExit;
    this.pathLengthEntry = pathLengthEntry ?? (smoothEntry ? defaultPathLengthSmooth : defaultPathLengthLinear);
    this.pathLengthExit = pathLengthExit ?? (smoothExit ? defaultPathLengthSmooth : defaultPathLengthLinear);
    this.keyframes = [];
  }

  abstract createKeyframes(sequence: Sequence): void;
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

  createKeyframes(sequence: Sequence) {
    this.keyframes = [];
    const pathCoordinateShifts = [-this.pathLengthEntry, 0, this.pathLengthExit];
    const times = pathCoordinateShifts.map((pathCoordinateShift) =>
      sequence.getTimeFromPathCoordinate(this.pathCoordinate + pathCoordinateShift),
    );

    for (let i = 0; i < 3; i++) {
      const time = times[i];
      const angle = this.initialAngle + i * this.angleIncrement;
      const contactPoint = i == 1 ? this.contactPointTurn : 0.5;

      const keyframeData = {
        orientation: getQuaternionFromAngleAxis(angle),
        contactPoint: contactPoint,
      };

      const keyframe = new FootKeyframe(
        time,
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
  loopShift: number;

  constructor(
    pathCoordinate: number,
    smoothEntry: boolean = true,
    smoothExit: boolean = true,
    pathLengthEntry?: number,
    pathLengthExit?: number,
    loopShift?: number,
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

  createKeyframes(sequence: Sequence) {
    if (!this.loopShift) return;

    this.keyframes = [];
    const pathCoordinateShifts = [-this.pathLengthEntry, 0, this.pathLengthExit];
    const times = pathCoordinateShifts.map((pathCoordinateShift) =>
      sequence.getTimeFromPathCoordinate(this.pathCoordinate + pathCoordinateShift),
    );
    const contactPoints = [0.5, this.contactPointTurn, 0.5];
    const lateralShift = (this.clockwise ? 1 : -1) * (this.forward ? 1 : -1) * this.loopShift;
    const positions = [
      new Vector<3>(0, lateralShift, 0),
      new Vector<3>((0.5 - this.contactPointTurn) * bladeLength, lateralShift, 0),
      new Vector<3>(0, lateralShift, 0),
    ];

    for (let i = 0; i < 3; i++) {
      const time = times[i];
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
        time,
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
