import type { PathCoordinate } from "./coordinates.js";
import { round3 } from "./round.js";

export const DEFAULT_ANNOTATION_COLOR = "#ffff00";

export interface AnnotationJSON {
  start: PathCoordinate;
  end: PathCoordinate;
  title: string;
  description: string;
  color: string;
}

export class Annotation {
  private _start: PathCoordinate;
  private _end: PathCoordinate;
  title: string;
  description: string;
  color: string;

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

  constructor(
    start: PathCoordinate,
    end: PathCoordinate,
    title: string = "Annotation",
    description: string = "",
    color: string = DEFAULT_ANNOTATION_COLOR,
  ) {
    this._start = round3(start) as PathCoordinate;
    this._end = round3(end) as PathCoordinate;
    this.title = title;
    this.description = description;
    this.color = color;
  }

  toJSON(): AnnotationJSON {
    return {
      start: this.start,
      end: this.end,
      title: this.title,
      description: this.description,
      color: this.color,
    };
  }

  static fromJSON(json: Partial<AnnotationJSON>): Annotation {
    return new Annotation(
      json.start as PathCoordinate,
      json.end as PathCoordinate,
      json.title ?? "Annotation",
      json.description ?? "",
      json.color ?? DEFAULT_ANNOTATION_COLOR,
    );
  }
}
