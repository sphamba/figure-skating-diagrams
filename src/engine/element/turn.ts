import { bladeLength } from "../constants.js";
import type { PathCoordinate } from "../coordinates.js";
import { Element } from "./element.js";
import type { FootKeyframe, HipsKeyframe } from "../keyframe.js";
import type { FootKey } from "../sequence.js";

export const defaultFootTurnLength = (bladeLength * 1.6) as PathCoordinate; // path units

export interface FootTurnJSON {
  type: string;
  start: PathCoordinate;
  end: PathCoordinate;
}

export abstract class FootTurn extends Element {
  footKey: FootKey;
  readonly left: boolean;
  readonly forward: boolean;
  readonly inside: boolean;
  abstract readonly type: string;

  get scalable(): boolean {
    return true;
  }

  constructor(
    footKey: FootKey,
    flags: { left: boolean; forward: boolean; inside: boolean },
    start: PathCoordinate,
    end: PathCoordinate,
  ) {
    super(start, end);
    this.footKey = footKey;
    this.left = flags.left;
    this.forward = flags.forward;
    this.inside = flags.inside;
  }

  get clockwise(): boolean {
    return (this.left === this.inside) === this.forward;
  }

  protected keyframeSpan(spanScale?: number): [PathCoordinate, PathCoordinate] {
    if (spanScale === undefined || spanScale === 1) {
      return [this.start, this.end];
    }
    return scaledSpan(this.start, this.end, spanScale);
  }

  protected abstract createOnIceFootKeyframes(
    start: PathCoordinate,
    end: PathCoordinate,
    lateralScale?: number,
  ): FootKeyframe[];

  protected abstract createFreeFootKeyframes(
    start: PathCoordinate,
    end: PathCoordinate,
    lateralScale?: number,
  ): FootKeyframe[];

  protected abstract createHipsKeyframes(start: PathCoordinate, end: PathCoordinate): HipsKeyframe[];

  toJSON(): FootTurnJSON {
    return {
      type: this.type,
      start: this.start,
      end: this.end,
    };
  }

  static fromJSON(json: FootTurnJSON): FootTurn {
    const constructor = footTurnConstructorsByType[json.type];
    if (!constructor) {
      throw new Error(`Unknown foot turn type: ${json.type}`);
    }
    const footKey = json.type.startsWith("Right") ? "footR" : "footL";
    return new constructor(footKey, json.start as PathCoordinate, json.end as PathCoordinate);
  }
}

function scaledSpan(start: PathCoordinate, end: PathCoordinate, factor: number): [PathCoordinate, PathCoordinate] {
  const middle = (start + end) / 2;
  return [(middle + (start - middle) * factor) as PathCoordinate, (middle + (end - middle) * factor) as PathCoordinate];
}

export type FootTurnConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => FootTurn;

export type FootTurnClass = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => FootTurn;

export const footTurnConstructorsByType: Record<string, FootTurnClass> = {};

export function changeFootTurnType(type: string, template: FootTurnJSON): FootTurn {
  return FootTurn.fromJSON({ ...template, type });
}
