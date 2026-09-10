/* Stroke classes: crossed/normal dynamic glides, generated from side,
 * direction, edge and stroke flags. */

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

/**
 * A dynamic glide is a crossed (crossover) or normal stroke: at the start of
 * the stroke both feet rest on the ice, shifted to the sides of the
 * centerline (swapped when the free foot crosses over, or when the stroke
 * goes backwards). One foot keeps skating the center of the element and is
 * centered for the whole stroke. The other foot starts shifted to its side,
 * shifts 0.5 m backwards along the path (forwards for a backwards stroke) to
 * twice that side offset, rests on the ice until 95% of
 * completion, and lifts off at the end of the stroke.
 */
export abstract class DynamicGlide extends Glide {
  private readonly strokeConfig: { left: boolean; crossed: boolean };

  constructor(
    config: { forward: boolean; left: boolean; crossed: boolean; edge: "inside" | "outside" | "neither" },
    start: PathCoordinate,
    end: PathCoordinate,
  ) {
    super({ forward: config.forward, leftOnIce: config.left, rightOnIce: !config.left, edge: config.edge }, start, end);
    this.strokeConfig = { left: config.left, crossed: config.crossed };
  }

  /** True when the center foot of the stroke is the left foot. */
  get left(): boolean {
    return this.strokeConfig.left;
  }

  /** True when the free foot crosses over the other one at the sides. */
  get crossed(): boolean {
    return this.strokeConfig.crossed;
  }

  getLeftFootKeyframes(_spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.dynamicFootKeyframes("footL", lateralScale);
  }

  getRightFootKeyframes(_spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.dynamicFootKeyframes("footR", lateralScale);
  }

  /** Foot keyframes of the dynamic stroke: the finishing on-ice foot starts
   * and stays centered, the other foot starts at its side offset and shifts
   * 0.5 m backwards along the path to twice that side offset, on the ice at
   * 95% and off the ice at the end. When a lateral scale is given, the
   * lateral side offsets are scaled by that factor. Swapped when crossed, or
   * when the stroke goes backwards. */
  private dynamicFootKeyframes(footKey: "footL" | "footR", lateralScale?: number): FootKeyframe[] {
    const [start, t95, end] = this.keyframeCoordinates();
    const scale = lateralScale ?? 1;
    const gliding = footKey === (this.left ? "footL" : "footR");
    let side = (footKey === "footL" ? halfFeetSpacing : -halfFeetSpacing) * scale;
    const swapped = this.crossed || !this.forward;
    if (swapped) {
      side = -side;
    }
    const facing = getQuaternionFromAngleAxis(this.forward ? 0 : Math.PI);
    const onIceData = (position: Vector<3>): FootData => {
      return { position, orientation: facing, contactPoint: 0.5 };
    };
    // Free foot shifted 0.5 m backwards along the path (forwards when the
    // stroke goes backwards).
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

  /** Span to place keyframes on, with the 95% coordinate. Glides never scale:
   * the keyframes always sit on the real span. */
  private keyframeCoordinates(): [PathCoordinate, PathCoordinate, PathCoordinate] {
    const t95 = (this.start + 0.95 * (this.end - this.start)) as PathCoordinate;
    return [this.start, t95, this.end];
  }
}

/** Define one dynamic glide variant class: the config closes over the
 * subclass, which registers itself into the type registry. */
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

/** The stroke words of each variant name, with their flags. */
const glideStrokes = [
  ["Normal", false],
  ["Crossed", true],
] as const;

/** Construct the crossed/normal stroke variants per side, direction, edge
 * and stroke word. */
for (const [side, left] of glideSides) {
  for (const [strokeName, crossed] of glideStrokes) {
    for (const [direction, forward] of glideDirections) {
      for (const [edgeName, edge] of glideEdges) {
        const type = `${side}${strokeName}${direction}${edgeName}Glide`;
        const config = { forward, left, crossed, edge };
        // Strokes share the short name pattern of the static glides.
        const shortName = `${side[0]}${direction[0]}${edgeLetter(edge)}`;
        if (!glideConstructorsByType[type]) {
          defineDynamicGlide(type, shortName, config);
        }
        glideKindChoices.push({
          type,
          label: `${side} ${strokeName.toLowerCase()} ${direction.toLowerCase()} ${edge === "neither" ? "" : edge + " "}glide`,
        });
      }
    }
  }
}

/** Named stroke kind constructor kept for use outside the registry (store,
 * tests), declared as a class so it is usable as an instance type.
 * Registering it replaces the generated variant of the same name, so a
 * round-trip through the registry returns this exact class. */

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

// Replace the generated variant by the declared class of the same name.
glideConstructorsByType["LeftNormalForwardInsideGlide"] = LeftNormalForwardInsideGlide;
