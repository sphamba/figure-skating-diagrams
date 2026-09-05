import type { Interpolable } from "./interpolate.js";
import type { PathCoordinate, Time } from "./coordinates.js";
import type { Quaternion } from "./quaternion.js";
import type { Vector } from "./vector.js";

type Transition = "linear" | "smooth";
type KeyframeData = { [key: string]: Interpolable };

export type TimeData = {
  pathCoordinate: PathCoordinate;
};

export type PositionAndOrientation3D = {
  position?: Vector<3>;
  orientation?: Quaternion;
};

export type FootData = PositionAndOrientation3D & {
  contactPoint?: number; // 0: heel, 1: toe
};

/**
 * A keyframe lives on an axis and stores data for that axis.
 *
 * The axis is an abstract coordinate. It is not always time.
 *
 * Part keyframes (foot, hips) sit on the path coordinate axis (u).
 * Clock keyframes (time) sit on the time axis (t) and store the path
 * coordinate as data. See Sequence.getTimeFromPathCoordinate.
 */
class Keyframe<DataType extends KeyframeData, Coordinate extends number = number> {
  /** Coordinate of the keyframe on its axis. For clock keyframes this is
   *  a Time. For part keyframes this is a PathCoordinate. */
  coordinate: Coordinate;
  data: DataType;
  transitionIn: Transition;
  transitionOut: Transition;

  constructor(
    coordinate: Coordinate,
    data: DataType,
    transitionIn: Transition = "linear",
    transitionOut: Transition = "linear",
  ) {
    this.coordinate = coordinate;
    this.data = data;
    this.transitionIn = transitionIn;
    this.transitionOut = transitionOut;
  }
}

export class FootKeyframe extends Keyframe<FootData, PathCoordinate> {}
export class HipsKeyframe extends Keyframe<PositionAndOrientation3D, PathCoordinate> {}
export class TimeKeyframe extends Keyframe<TimeData, Time> {}
