import type { PathCoordinate } from "./coordinates.js";
import type { FootKeyframe, HipsKeyframe } from "./keyframe.js";

/**
 * An element is a portion of a sequence, defined by a range of path
 * coordinates (from `start` to `end`).
 *
 * An element can contribute keyframes to the left foot, the right foot, and
 * the hips. Child classes override the three getter methods and compute the
 * returned keyframes from the element's `start` and `end` path coordinates.
 */
export abstract class Element {
  start: PathCoordinate;
  end: PathCoordinate;

  /**
   * @param start - Path coordinate where this element starts.
   * @param end - Path coordinate where this element ends.
   */
  constructor(start: PathCoordinate, end: PathCoordinate) {
    this.start = start;
    this.end = end;
  }

  /** Keyframes contributed to the left foot. */
  abstract getLeftFootKeyframes(): FootKeyframe[];

  /** Keyframes contributed to the right foot. */
  abstract getRightFootKeyframes(): FootKeyframe[];

  /** Keyframes contributed to the hips. */
  abstract getHipsKeyframes(): HipsKeyframe[];
}
