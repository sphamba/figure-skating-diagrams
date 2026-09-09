import type { PathCoordinate } from "../coordinates.js";
import type { FootKeyframe, HipsKeyframe } from "../keyframe.js";

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

  /** Name used to identify this element type when (de)serializing. */
  abstract get type(): string;

  /** True when the element responds to a span scale, re-basing its keyframes
   * and displayed span onto the span scaled about its middle. Only turns
   * scale: turns defined later inherit scaling from their base class. */
  get scalable(): boolean {
    return false;
  }

  /**
   * @param start - Path coordinate where this element starts.
   * @param end - Path coordinate where this element ends.
   */
  constructor(start: PathCoordinate, end: PathCoordinate) {
    this.start = start;
    this.end = end;
  }

  /** Keyframes contributed to the left foot. When a span scale is given, the
   * returned keyframes are re-based onto the span scaled about its middle,
   * without changing the element itself. */
  abstract getLeftFootKeyframes(spanScale?: number): FootKeyframe[];

  /** Keyframes contributed to the right foot (see getLeftFootKeyframes). */
  abstract getRightFootKeyframes(spanScale?: number): FootKeyframe[];

  /** Keyframes contributed to the hips (see getLeftFootKeyframes). */
  abstract getHipsKeyframes(spanScale?: number): HipsKeyframe[];

  /** Serialize this element to a plain JSON object. */
  abstract toJSON(): unknown;

  /**
   * Compute new start and end path coordinates for a scaled span, with the
   * middle point of the span kept fixed. `factor` 1 gives the original span.
   */
  scaleAboutMiddle(factor: number): [PathCoordinate, PathCoordinate] {
    const start = this.start as number;
    const end = this.end as number;
    const middle = (start + end) / 2;
    const scaledStart = middle + (start - middle) * factor;
    const scaledEnd = middle + (end - middle) * factor;
    return [scaledStart as PathCoordinate, scaledEnd as PathCoordinate];
  }
}
