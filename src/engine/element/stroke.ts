import type { PathCoordinate } from "../coordinates.js";
import {
  edgeLetter,
  Glide,
  glideConstructorsByType,
  glideDirections,
  glideEdges,
  glideKindChoices,
  glideSides,
  halfFeetSpacing,
  offIceFootHeight,
} from "./glide.js";
import type { GlideConstructor } from "./glide.js";
import { type FootData, FootKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";

export abstract class DynamicGlide extends Glide {
  private readonly strokeConfig: { left: boolean; crossed: boolean; crossedBack: boolean };

  constructor(
    config: {
      forward: boolean;
      left: boolean;
      crossed: boolean;
      crossedBack?: boolean;
      edge: "inside" | "outside" | "neither";
    },
    start: PathCoordinate,
    end: PathCoordinate,
  ) {
    super({ forward: config.forward, leftOnIce: config.left, rightOnIce: !config.left, edge: config.edge }, start, end);
    this.strokeConfig = { left: config.left, crossed: config.crossed, crossedBack: config.crossedBack ?? false };
  }

  get left(): boolean {
    return this.strokeConfig.left;
  }

  get crossed(): boolean {
    return this.strokeConfig.crossed;
  }

  get crossedBack(): boolean {
    return this.strokeConfig.crossedBack;
  }

  getLeftFootKeyframes(_spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.dynamicFootKeyframes("footL", lateralScale);
  }

  getRightFootKeyframes(_spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.dynamicFootKeyframes("footR", lateralScale);
  }

  private dynamicFootKeyframes(footKey: "footL" | "footR", lateralScale?: number): FootKeyframe[] {
    const [start, t95, end] = this.keyframeCoordinates();
    const scale = lateralScale ?? 1;
    const gliding = footKey === (this.left ? "footL" : "footR");
    let side = (footKey === "footL" ? halfFeetSpacing : -halfFeetSpacing) * scale;
    const swapped = this.crossed;
    if (swapped) {
      side = -side;
    }
    const facing = getQuaternionFromAngleAxis(this.forward ? 0 : Math.PI);
    const onIceData = (position: Vector<3>): FootData => {
      return { position, orientation: facing, contactPoint: 0.5 };
    };
    const offset = this.forward ? -0.5 : 0.5;
    if (gliding) {
      const centered = onIceData(new Vector<3>(0, 0, 0));
      return [
        new FootKeyframe(start, centered, "linear", "linear"),
        new FootKeyframe(t95, centered, "linear", "linear"),
        new FootKeyframe(end, centered, "linear", "linear"),
      ];
    }
    const doubleSide = side * 2;
    return [
      new FootKeyframe(start, onIceData(new Vector<3>(0, side, 0)), "linear", "linear"),
      new FootKeyframe(t95, onIceData(new Vector<3>(offset, doubleSide, 0)), "linear", "linear"),
      new FootKeyframe(end, onIceData(new Vector<3>(offset, doubleSide, offIceFootHeight)), "linear", "linear"),
    ];
  }

  private keyframeCoordinates(): [PathCoordinate, PathCoordinate, PathCoordinate] {
    const t95 = (this.start + 0.95 * (this.end - this.start)) as PathCoordinate;
    return [this.start, t95, this.end];
  }
}

function defineDynamicGlide(
  type: string,
  shortName: string,
  config: { forward: boolean; left: boolean; crossed: boolean; edge: "inside" | "outside" | "neither" },
): GlideConstructor {
  const Variant = class extends DynamicGlide {
    constructor(start: PathCoordinate, end: PathCoordinate) {
      super(config, start, end);
    }

    get type(): string {
      return type;
    }

    get shortName(): string {
      return shortName;
    }
  };
  glideConstructorsByType[type] = Variant;
  return Variant;
}

const glideStrokes = [
  ["Normal", false, "normal", false],
  ["Crossed", true, "crossed", false],
  ["CrossedBack", true, "crossed back", true],
] as const;

for (const [side, left] of glideSides) {
  for (const [strokeName, crossed, strokeLabel, crossedBack] of glideStrokes) {
    for (const [direction, forward] of glideDirections) {
      for (const [edgeName, edge] of glideEdges) {
        const type = `${side}${strokeName}${direction}${edgeName}Glide`;
        const config = { forward, left, crossed, crossedBack, edge };
        const shortName = `${side[0]}${direction[0]}${edgeLetter(edge)}`;
        if (!glideConstructorsByType[type]) {
          defineDynamicGlide(type, shortName, config);
        }
        glideKindChoices.push({
          type,
          label: `${side} ${strokeLabel} ${direction.toLowerCase()} ${edge === "neither" ? "" : edge + " "}glide`,
        });
      }
    }
  }
}

export class LeftNormalForwardInsideGlide extends DynamicGlide {
  constructor(start: PathCoordinate, end: PathCoordinate) {
    super({ forward: true, left: true, crossed: false, edge: "inside" }, start, end);
  }

  get type(): string {
    return "LeftNormalForwardInsideGlide";
  }

  get shortName(): string {
    return "LFI";
  }
}

glideConstructorsByType["LeftNormalForwardInsideGlide"] = LeftNormalForwardInsideGlide;
