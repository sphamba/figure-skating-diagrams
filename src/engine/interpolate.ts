import { Vector } from './vector.js'
import { Quaternion } from './quaternion.js'

export type Interpolable = number | Vector<number> | Quaternion

export function interpolate(a: number, b: number, s: number): number
export function interpolate(a: Vector<number>, b: Vector<number>, s: number): Vector<number>
export function interpolate(a: Quaternion, b: Quaternion, s: number): Quaternion

export function interpolate(a: Interpolable, b: Interpolable, s: number): Interpolable {
  if (typeof a === 'number' && typeof b === 'number') {
    return interpolateNumber(a, b, s)
  } else if (a instanceof Vector && b instanceof Vector) {
    return interpolateVector(a, b, s)
  } else if (a instanceof Quaternion && b instanceof Quaternion) {
    return interpolateQuaternion(a, b, s)
  } else {
    throw new Error(`Cannot interpolate ${a} and ${b}`)
  }
}

function interpolateNumber(a: number, b: number, s: number): number {
  return a * (1 - s) + b * s
}

function interpolateVector<Size extends number>(
  a: Vector<Size>,
  b: Vector<Size>,
  s: number,
): Vector<Size> {
  return a.times(1 - s).plus(b.times(s))
}

function interpolateQuaternion(a: Quaternion, b: Quaternion, s: number): Quaternion {
  const change = a.inverse().times(b)
  return a.times(change.power(s))
}
