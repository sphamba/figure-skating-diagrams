import type { PathCoordinate } from "./coordinates.js";

export const DEFAULT_ANNOTATION_COLOR = "#ffff00";

export interface AnnotationJSON {
  start: PathCoordinate;
  end: PathCoordinate;
  title: string;
  description: string;
  color: string;
}

export class Annotation {
  start: PathCoordinate;
  end: PathCoordinate;
  title: string;
  description: string;
  color: string;

  constructor(
    start: PathCoordinate,
    end: PathCoordinate,
    title: string = "Annotation",
    description: string = "",
    color: string = DEFAULT_ANNOTATION_COLOR,
  ) {
    this.start = start;
    this.end = end;
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
