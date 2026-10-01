import type { PathCoordinate } from "../coordinates.js";
import type { FootKeyframe, HipsKeyframe } from "../keyframe.js";
import { round3 } from "../round.js";

export abstract class Element {
  private _start: PathCoordinate;
  private _end: PathCoordinate;

  get start(): PathCoordinate {
    return this._start;
  }

  set start(value: PathCoordinate) {
    this._start = round3(value) as PathCoordinate;
  }

  get end(): PathCoordinate {
    return this._end;
  }

  set end(value: PathCoordinate) {
    this._end = round3(value) as PathCoordinate;
  }

  abstract get type(): string;

  abstract get defaultShortName(): string;

  shortName: string;

  get scalable(): boolean {
    return false;
  }

  constructor(start: PathCoordinate, end: PathCoordinate) {
    this._start = round3(start) as PathCoordinate;
    this._end = round3(end) as PathCoordinate;
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
