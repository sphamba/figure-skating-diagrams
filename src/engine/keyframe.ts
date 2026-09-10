import type { Interpolable } from "./interpolate.js";
import type { PathCoordinate, Time } from "./coordinates.js";
import { Quaternion } from "./quaternion.js";
import { Vector } from "./vector.js";

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

interface VectorJSON {
  data: number[];
}
interface QuaternionJSON {
  real: number;
  vector: VectorJSON;
}

export interface FootKeyframeJSON {
  kind: "FootKeyframe";
  coordinate: PathCoordinate;
  data: { position?: VectorJSON; orientation?: QuaternionJSON; contactPoint?: number };
  transitionIn: Transition;
  transitionOut: Transition;
}

export interface HipsKeyframeJSON {
  kind: "HipsKeyframe";
  coordinate: PathCoordinate;
  data: { position?: VectorJSON; orientation?: QuaternionJSON };
  transitionIn: Transition;
  transitionOut: Transition;
}

export interface TimeKeyframeJSON {
  kind: "TimeKeyframe";
  coordinate: Time;
  data: { pathCoordinate: PathCoordinate };
  transitionIn: Transition;
  transitionOut: Transition;
}

class Keyframe<DataType extends KeyframeData, Coordinate extends number = number> {
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

export class FootKeyframe extends Keyframe<FootData, PathCoordinate> {
  toJSON(): FootKeyframeJSON {
    return {
      kind: "FootKeyframe",
      coordinate: this.coordinate,
      data: {
        position: this.data.position?.toJSON(),
        orientation: this.data.orientation?.toJSON(),
        contactPoint: this.data.contactPoint,
      },
      transitionIn: this.transitionIn,
      transitionOut: this.transitionOut,
    };
  }

  static fromJSON(json: FootKeyframeJSON): FootKeyframe {
    const data: FootData = {};
    if (json.data?.position) data.position = Vector.fromJSON(json.data.position) as Vector<3>;
    if (json.data?.orientation) data.orientation = Quaternion.fromJSON(json.data.orientation);
    if (json.data?.contactPoint !== undefined) data.contactPoint = json.data.contactPoint;
    return new FootKeyframe(json.coordinate as PathCoordinate, data, json.transitionIn, json.transitionOut);
  }
}

export class HipsKeyframe extends Keyframe<PositionAndOrientation3D, PathCoordinate> {
  toJSON(): HipsKeyframeJSON {
    return {
      kind: "HipsKeyframe",
      coordinate: this.coordinate,
      data: {
        position: this.data.position?.toJSON(),
        orientation: this.data.orientation?.toJSON(),
      },
      transitionIn: this.transitionIn,
      transitionOut: this.transitionOut,
    };
  }

  static fromJSON(json: HipsKeyframeJSON): HipsKeyframe {
    const data: PositionAndOrientation3D = {};
    if (json.data?.position) data.position = Vector.fromJSON(json.data.position) as Vector<3>;
    if (json.data?.orientation) data.orientation = Quaternion.fromJSON(json.data.orientation);
    return new HipsKeyframe(json.coordinate as PathCoordinate, data, json.transitionIn, json.transitionOut);
  }
}

export class TimeKeyframe extends Keyframe<TimeData, Time> {
  toJSON(): TimeKeyframeJSON {
    return {
      kind: "TimeKeyframe",
      coordinate: this.coordinate,
      data: {
        pathCoordinate: this.data.pathCoordinate,
      },
      transitionIn: this.transitionIn,
      transitionOut: this.transitionOut,
    };
  }

  static fromJSON(json: TimeKeyframeJSON): TimeKeyframe {
    return new TimeKeyframe(
      json.coordinate as Time,
      { pathCoordinate: json.data.pathCoordinate as PathCoordinate },
      json.transitionIn,
      json.transitionOut,
    );
  }
}
