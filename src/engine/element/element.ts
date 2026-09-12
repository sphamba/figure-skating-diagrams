import type { PathCoordinate } from "../coordinates.js";
import type { FootKeyframe, HipsKeyframe } from "../keyframe.js";

export abstract class Element {
  start: PathCoordinate;
  end: PathCoordinate;

  abstract get type(): string;

  abstract get defaultShortName(): string;

  shortName: string;

  get scalable(): boolean {
    return false;
  }

  constructor(start: PathCoordinate, end: PathCoordinate) {
    this.start = start;
    this.end = end;
    // TS rejects abstract access through `this` in its own body, hence the cast.
    this.shortName = (this as { defaultShortName: string }).defaultShortName;
  }

  abstract getLeftFootKeyframes(spanScale?: number, lateralScale?: number): FootKeyframe[];

  abstract getRightFootKeyframes(spanScale?: number, lateralScale?: number): FootKeyframe[];

  abstract getHipsKeyframes(spanScale?: number): HipsKeyframe[];

  abstract toJSON(): unknown;

  scaleAboutMiddle(factor: number): [PathCoordinate, PathCoordinate] {
    const start = this.start as number;
    const end = this.end as number;
    const middle = (start + end) / 2;
    const scaledStart = middle + (start - middle) * factor;
    const scaledEnd = middle + (end - middle) * factor;
    return [scaledStart as PathCoordinate, scaledEnd as PathCoordinate];
  }
}
