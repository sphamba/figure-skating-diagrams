import type { PathCoordinate } from "../coordinates.js";
import { Element } from "./element.js";
import { type FootData, FootKeyframe, HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";

export const offIceFootHeight = 0.2; // metres
export const halfFeetSpacing = 0.15; // metres

export interface GlideJSON {
  type: string;
  start: PathCoordinate;
  end: PathCoordinate;
  shortName?: string;
}

export type GlideConstructor = new (start: PathCoordinate, end: PathCoordinate) => Glide;

export abstract class Glide extends Element {
  private readonly config: {
    forward: boolean;
    leftOnIce: boolean;
    rightOnIce: boolean;
    edge: "inside" | "outside" | "neither";
  };

  abstract readonly type: string;

  constructor(
    config: { forward: boolean; leftOnIce: boolean; rightOnIce: boolean; edge: "inside" | "outside" | "neither" },
    start: PathCoordinate,
    end: PathCoordinate,
  ) {
    super(start, end);
    this.config = config;
  }

  get forward(): boolean {
    return this.config.forward;
  }

  get leftOnIce(): boolean {
    return this.config.leftOnIce;
  }

  get rightOnIce(): boolean {
    return this.config.rightOnIce;
  }

  get edge(): "inside" | "outside" | "neither" {
    return this.config.edge;
  }

  get clockwise(): boolean {
    return (this.leftOnIce === (this.edge === "inside")) === this.forward;
  }

  getLeftFootKeyframes(_spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.createFootKeyframes("footL", this.leftOnIce, lateralScale);
  }

  getRightFootKeyframes(_spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.createFootKeyframes("footR", this.rightOnIce, lateralScale);
  }

  getHipsKeyframes(_spanScale?: number): HipsKeyframe[] {
    return [
      new HipsKeyframe(
        this.start,
        { position: new Vector<3>(0, 0, 0), orientation: getQuaternionFromAngleAxis(0) },
        "smooth",
        "smooth",
      ),
      new HipsKeyframe(
        this.end,
        { position: new Vector<3>(0, 0, 0), orientation: getQuaternionFromAngleAxis(0) },
        "smooth",
        "smooth",
      ),
    ];
  }

  toJSON(): GlideJSON {
    return { type: this.type, start: this.start, end: this.end, shortName: this.shortName };
  }

  static fromJSON(json: GlideJSON): Glide {
    const constructor = glideConstructorsByType[json.type];
    if (!constructor) {
      throw new Error(`Unknown glide type: ${json.type}`);
    }
    return new constructor(json.start, json.end);
  }

  private createFootKeyframes(footKey: "footL" | "footR", onIce: boolean, lateralScale?: number): FootKeyframe[] {
    const [start, end] = [this.start, this.end];
    const bothOnIce = this.leftOnIce && this.rightOnIce;
    const scale = lateralScale ?? 1;
    const side = (footKey === "footL" ? halfFeetSpacing : -halfFeetSpacing) * scale;
    const lateral = onIce ? (bothOnIce ? side : 0) : side;
    const data: FootData = {
      position: new Vector<3>(0, lateral, onIce ? 0 : offIceFootHeight),
      orientation: getQuaternionFromAngleAxis(this.forward ? 0 : Math.PI),
      contactPoint: 0.5,
    };
    return [new FootKeyframe(start, data, "smooth", "smooth"), new FootKeyframe(end, data, "smooth", "smooth")];
  }
}

type GlideConfig = {
  forward: boolean;
  leftOnIce: boolean;
  rightOnIce: boolean;
  edge: "inside" | "outside" | "neither";
};

export const glideConstructorsByType: Record<string, GlideConstructor> = {};

function defineGlide(type: string, shortName: string, config: GlideConfig): GlideConstructor {
  const Variant = class extends Glide {
    constructor(start: PathCoordinate, end: PathCoordinate) {
      super(config, start, end);
    }

    get type(): string {
      return type;
    }

    get defaultShortName(): string {
      return shortName;
    }
  };
  glideConstructorsByType[type] = Variant;
  return Variant;
}

export const glideSides = [
  ["Left", true],
  ["Right", false],
] as const;
export const glideDirections = [
  ["Forward", true],
  ["Backward", false],
] as const;
export const glideEdges = [
  ["Inside", "inside"],
  ["Outside", "outside"],
  ["", "neither"],
] as const;

export const edgeLetter = (edge: "inside" | "outside" | "neither"): string =>
  edge === "inside" ? "I" : edge === "outside" ? "O" : "";

export const glideKindChoices: { type: string; label: string }[] = [];

for (const [side, left] of glideSides) {
  for (const [direction, forward] of glideDirections) {
    for (const [edgeName, edge] of glideEdges) {
      const type = `${side}${direction}${edgeName}Glide`;
      const config: GlideConfig = { forward, leftOnIce: left, rightOnIce: !left, edge };
      const shortName = `${side[0]}${direction[0]}${edgeLetter(edge)}`;
      if (!glideConstructorsByType[type]) {
        defineGlide(type, shortName, config);
      }
      glideKindChoices.push({
        type,
        label: `${side} ${direction.toLowerCase()} ${edge === "neither" ? "" : edge + " "}glide`,
      });
    }
  }
}

for (const [direction, forward] of glideDirections) {
  const type = `Both${direction}Glide`;
  const config: GlideConfig = { forward, leftOnIce: true, rightOnIce: true, edge: "neither" };
  const shortName = "";
  if (!glideConstructorsByType[type]) {
    defineGlide(type, shortName, config);
  }
  glideKindChoices.push({ type, label: `Two-foot ${direction.toLowerCase()} glide` });
}

export class LeftForwardInsideGlide extends Glide {
  constructor(start: PathCoordinate, end: PathCoordinate) {
    super({ forward: true, leftOnIce: true, rightOnIce: false, edge: "inside" }, start, end);
  }

  get type(): string {
    return "LeftForwardInsideGlide";
  }

  get defaultShortName(): string {
    return "LFI";
  }
}

export class LeftForwardOutsideGlide extends Glide {
  constructor(start: PathCoordinate, end: PathCoordinate) {
    super({ forward: true, leftOnIce: true, rightOnIce: false, edge: "outside" }, start, end);
  }

  get type(): string {
    return "LeftForwardOutsideGlide";
  }

  get defaultShortName(): string {
    return "LFO";
  }
}

export class BothForwardGlide extends Glide {
  constructor(start: PathCoordinate, end: PathCoordinate) {
    super({ forward: true, leftOnIce: true, rightOnIce: true, edge: "neither" }, start, end);
  }

  get type(): string {
    return "BothForwardGlide";
  }

  get defaultShortName(): string {
    return "";
  }
}

glideConstructorsByType["LeftForwardInsideGlide"] = LeftForwardInsideGlide;
glideConstructorsByType["LeftForwardOutsideGlide"] = LeftForwardOutsideGlide;
glideConstructorsByType["BothForwardGlide"] = BothForwardGlide;
