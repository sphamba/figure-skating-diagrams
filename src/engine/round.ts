import { PartialVector, Vector } from "./vector.js";

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// Returns the same vector when already rounded, so shared control points keep
// their object identity.
export function roundVector2(vector: Vector<2>): Vector<2> {
  if (vector.x === round3(vector.x) && vector.y === round3(vector.y)) return vector;
  return new Vector<2>(round3(vector.x), round3(vector.y));
}

export function roundPosition3(position: Vector<3> | PartialVector<3>): Vector<3> | PartialVector<3> {
  if (position instanceof PartialVector) {
    return new PartialVector<3>(...position.data.map((value) => (value === undefined ? undefined : round3(value))));
  }
  return new Vector<3>(round3(position.x), round3(position.y), round3(position.z));
}
