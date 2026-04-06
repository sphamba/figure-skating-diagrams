import type { Interpolable } from './interpolate.js'
import type { Quaternion } from './quaternion.js'
import type { Vector } from './vector.js'

type Transition = 'linear' | 'smooth'
type KeyframeData = { [key: string]: Interpolable }

export type TimeData = {
  pathCoordinate: number
}

export type PositionAndOrientation3D = {
  position?: Vector<3>
  orientation?: Quaternion
}

export type FootData = PositionAndOrientation3D & {
  contactPoint?: number // 0: heel, 1: toe
}

class Keyframe<DataType extends KeyframeData> {
  time: number
  data: DataType
  transitionIn: Transition
  transitionOut: Transition

  constructor(
    time: number,
    data: DataType,
    transitionIn: Transition = 'linear',
    transitionOut: Transition = 'linear',
  ) {
    this.time = time
    this.data = data
    this.transitionIn = transitionIn
    this.transitionOut = transitionOut
  }
}

export class FootKeyframe extends Keyframe<FootData> {}
export class HipsKeyframe extends Keyframe<PositionAndOrientation3D> {}
export class TimeKeyframe extends Keyframe<TimeData> {}
