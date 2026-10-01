import type { Interpolable } from "./interpolate.js";
import type { PathCoordinate, Time } from "./coordinates.js";
import { Quaternion } from "./quaternion.js";
import { round3, roundPosition3 } from "./round.js";
import { PartialVector, Vector } from "./vector.js";

export type Transition = "linear" | "smooth";
type KeyframeData = { [key: string]: Interpolable | boolean };

export type TimeData = {
  pathCoordinate: PathCoordinate;
};

export type PositionAndOrientation3D = {
  position?: Vector<3> | PartialVector<3>;
  orientation?: Quaternion;
};

export type FootData = PositionAndOrientation3D & {
  contactPoint?: number; // 0: heel, 1: toe
  toePick?: boolean;
  spins?: number;
  spinShift?: number;
};

interface VectorJSON {
  data: number[];
}
interface QuaternionJSON {
  real: number;
  vector: VectorJSON;
}
// Unset coordinates serialize as null, so a vector with every coordinate set is
// tellable from a partial one.
interface PartialVectorJSON {
  data: Array<number | null>;
}
type PositionJSON = VectorJSON | PartialVectorJSON;

// Full and partial positions share one parse: every coordinate set gives a
// Vector, a null coordinate gives a PartialVector. Unset coordinates of a
// partial vector keep the array length, so trailing coordinates stay unset.
function parsePositionJSON(json: PositionJSON): Vector<3> | PartialVector<3> {
  if (json.data.every((value) => value !== null)) {
    return new Vector<3>(...(json.data as number[]));
  }
  return new PartialVector<3>(...json.data.map((value) => (value === null ? undefined : value)));
}

export interface FootKeyframeJSON {
  kind: "FootKeyframe";
  coordinate: PathCoordinate;
  data: {
    position?: PositionJSON;
    orientation?: QuaternionJSON;
    contactPoint?: number;
    toePick?: boolean;
    spins?: number;
    spinShift?: number;
  };
  transitionIn: Transition;
  transitionOut: Transition;
}

export interface HipsKeyframeJSON {
  kind: "HipsKeyframe";
  coordinate: PathCoordinate;
  data: { position?: PositionJSON; orientation?: QuaternionJSON };
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

export type TimingKind = "time" | "beats";

export interface TimingKeyframeJSON {
  kind: "TimingKeyframe";
  coordinate: PathCoordinate;
  data: { type: TimingKind; value: number };
  transitionIn: Transition;
  transitionOut: Transition;
}

class Keyframe<DataType extends KeyframeData, Coordinate extends number = number> {
  private _coordinate: Coordinate;
  data: DataType;
  transitionIn: Transition;
  transitionOut: Transition;

  get coordinate(): Coordinate {
    return this._coordinate;
  }

  set coordinate(value: Coordinate) {
    this._coordinate = round3(value) as Coordinate;
  }

  constructor(
    coordinate: Coordinate,
    data: DataType,
    transitionIn: Transition = "linear",
    transitionOut: Transition = "linear",
  ) {
    this._coordinate = round3(coordinate) as Coordinate;
    this.data = data;
    this.transitionIn = transitionIn;
    this.transitionOut = transitionOut;
  }
}

// A rounded copy of the foot data: the position, the contact point and the
// spin shift carry at most 3 decimal places. Orientation, toePick and spins
// stay untouched.
function roundFootData(data: FootData): FootData {
  const rounded: FootData = { ...data };
  if (data.position) rounded.position = roundPosition3(data.position);
  if (data.contactPoint !== undefined) rounded.contactPoint = round3(data.contactPoint);
  if (data.spinShift !== undefined) rounded.spinShift = round3(data.spinShift);
  return rounded;
}

export class FootKeyframe extends Keyframe<FootData, PathCoordinate> {
  constructor(
    coordinate: PathCoordinate,
    data: FootData,
    transitionIn: Transition = "linear",
    transitionOut: Transition = "linear",
  ) {
    super(coordinate, roundFootData(data), transitionIn, transitionOut);
  }

  toJSON(): FootKeyframeJSON {
    return {
      kind: "FootKeyframe",
      coordinate: this.coordinate,
      data: {
        position: this.data.position?.toJSON(),
        orientation: this.data.orientation?.toJSON(),
        contactPoint: this.data.contactPoint,
        toePick: this.data.toePick,
        spins: this.data.spins ?? 0,
        spinShift: this.data.spinShift ?? 0,
      },
      transitionIn: this.transitionIn,
      transitionOut: this.transitionOut,
    };
  }

  static fromJSON(json: FootKeyframeJSON): FootKeyframe {
    const data: FootData = {};
    if (json.data?.position) data.position = parsePositionJSON(json.data.position);
    if (json.data?.orientation) data.orientation = Quaternion.fromJSON(json.data.orientation);
    if (json.data?.contactPoint !== undefined) data.contactPoint = json.data.contactPoint;
    data.toePick = json.data?.toePick ?? false;
    if (json.data?.spins !== undefined) data.spins = json.data.spins;
    if (json.data?.spinShift !== undefined) data.spinShift = json.data.spinShift;
    return new FootKeyframe(json.coordinate as PathCoordinate, data, json.transitionIn, json.transitionOut);
  }
}

export class HipsKeyframe extends Keyframe<PositionAndOrientation3D, PathCoordinate> {
  constructor(
    coordinate: PathCoordinate,
    data: PositionAndOrientation3D,
    transitionIn: Transition = "linear",
    transitionOut: Transition = "linear",
  ) {
    const rounded: PositionAndOrientation3D = { ...data };
    if (data.position) rounded.position = roundPosition3(data.position);
    super(coordinate, rounded, transitionIn, transitionOut);
  }

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
    if (json.data?.position) data.position = parsePositionJSON(json.data.position);
    if (json.data?.orientation) data.orientation = Quaternion.fromJSON(json.data.orientation);
    return new HipsKeyframe(json.coordinate as PathCoordinate, data, json.transitionIn, json.transitionOut);
  }
}

export class TimingKeyframe {
  private _pathCoordinate: PathCoordinate;
  kind: TimingKind;
  private _value: number; // seconds for kind "time", beat count for kind "beats"
  transitionIn: Transition;
  transitionOut: Transition;

  // Keeps addKeyframe sorting by coordinate working for this class too.
  get coordinate(): PathCoordinate {
    return this.pathCoordinate;
  }

  get pathCoordinate(): PathCoordinate {
    return this._pathCoordinate;
  }

  set pathCoordinate(value: PathCoordinate) {
    this._pathCoordinate = round3(value) as PathCoordinate;
  }

  get value(): number {
    return this._value;
  }

  set value(value: number) {
    this._value = round3(value);
  }

  constructor(
    pathCoordinate: PathCoordinate,
    kind: TimingKind,
    value: number,
    transitionIn: Transition = "linear",
    transitionOut: Transition = "linear",
  ) {
    this._pathCoordinate = round3(pathCoordinate) as PathCoordinate;
    this.kind = kind;
    this._value = round3(value);
    this.transitionIn = transitionIn;
    this.transitionOut = transitionOut;
  }

  toJSON(): TimingKeyframeJSON {
    return {
      kind: "TimingKeyframe",
      coordinate: this.pathCoordinate,
      data: { type: this.kind, value: this.value },
      transitionIn: this.transitionIn,
      transitionOut: this.transitionOut,
    };
  }

  static fromJSON(json: TimingKeyframeJSON): TimingKeyframe {
    return new TimingKeyframe(
      json.coordinate as PathCoordinate,
      json.data.type,
      json.data.value,
      json.transitionIn,
      json.transitionOut,
    );
  }
}
