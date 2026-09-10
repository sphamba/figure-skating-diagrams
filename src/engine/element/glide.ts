/* Glide classes: elements that set a static pose or a crossed/normal stroke
 * for both feet and the hips, generated from side, direction and edge flags. */

import type { PathCoordinate } from "../coordinates.js";
import { Element } from "./element.js";
import { type FootData, FootKeyframe, HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";

/** Height above the ice for a foot not on the ice, in metres. */
export const offIceFootHeight = 0.2;

/** Lateral offset of each foot when both feet are on the ice, in metres:
 * the feet are 2 x halfFeetSpacing apart. */
export const halfFeetSpacing = 0.15;

/** JSON shape of a Glide element used for (de)serialization. */
export interface GlideJSON {
  type: string;
  start: PathCoordinate;
  end: PathCoordinate;
}

/** Constructor type of a generated glide variant. */
export type GlideConstructor = new (start: PathCoordinate, end: PathCoordinate) => Glide;

/**
 * A Glide element sets the pose for the span it covers: the feet marked as
 * on the ice rest on the ice (height 0), the other feet are lifted off the
 * ice at a fixed height. Foot orientation faces forward or backward, on-ice
 * feet are centered except in the two-foot pose, and the off-ice foot sits
 * half the spacing to its side of the lateral center. A one-foot glide is
 * skated on an inside edge, an outside edge, or with no edge; a two-foot
 * glide has no edge. Keyframes are placed at the start and the end of the
 * span and blend smoothly into the neighboring elements.
 *
 * A variant is described by a config object: the direction of travel, the
 * feet on the ice, and the skated edge of the on-ice foot ("neither" for a
 * two-foot glide).
 */
export abstract class Glide extends Element {
  private readonly config: {
    forward: boolean;
    leftOnIce: boolean;
    rightOnIce: boolean;
    edge: "inside" | "outside" | "neither";
  };

  /** Name used to identify this glide type when (de)serializing. */
  abstract readonly type: string;

  constructor(
    config: { forward: boolean; leftOnIce: boolean; rightOnIce: boolean; edge: "inside" | "outside" | "neither" },
    start: PathCoordinate,
    end: PathCoordinate,
  ) {
    super(start, end);
    this.config = config;
  }

  /** True when the pose faces forward along the path, false for backward. */
  get forward(): boolean {
    return this.config.forward;
  }

  /** True when the left foot is on the ice in this glide. */
  get leftOnIce(): boolean {
    return this.config.leftOnIce;
  }

  /** True when the right foot is on the ice in this glide. */
  get rightOnIce(): boolean {
    return this.config.rightOnIce;
  }

  /** Skated edge of the on-ice foot. A two-foot glide is "neither". */
  get edge(): "inside" | "outside" | "neither" {
    return this.config.edge;
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

  /** Serialize this glide to a plain JSON object. */
  toJSON(): GlideJSON {
    return { type: this.type, start: this.start, end: this.end };
  }

  /** Reconstruct a glide of the matching concrete type from serialized data. */
  static fromJSON(json: GlideJSON): Glide {
    const constructor = glideConstructorsByType[json.type];
    if (!constructor) {
      throw new Error(`Unknown glide type: ${json.type}`);
    }
    return new constructor(json.start, json.end);
  }

  /** Default keyframes for one foot, at the start and the end of the span.
   * An on-ice foot is centered, except in the two-foot glide where it sits
   * half the spacing to its side. The off-ice foot always sits half the
   * spacing to its side. When a lateral scale is given, that lateral shift
   * is scaled by the factor. */
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

/** Static pose config of a glide variant. */
type GlideConfig = {
  forward: boolean;
  leftOnIce: boolean;
  rightOnIce: boolean;
  edge: "inside" | "outside" | "neither";
};

/** Map a glide type name to its constructor, for deserialization. */
export const glideConstructorsByType: Record<string, GlideConstructor> = {};

/** Define one static glide variant class: the config closes over the
 * subclass, which registers itself into the type registry. */
function defineGlide(type: string, config: GlideConfig): GlideConstructor {
  const Variant = class extends Glide {
    constructor(start: PathCoordinate, end: PathCoordinate) {
      super(config, start, end);
    }

    get type(): string {
      return type;
    }
  };
  glideConstructorsByType[type] = Variant;
  return Variant;
}

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
  config: { forward: boolean; left: boolean; crossed: boolean; edge: "inside" | "outside" | "neither" },
): GlideConstructor {
  const Variant = class extends DynamicGlide {
    constructor(start: PathCoordinate, end: PathCoordinate) {
      super(config, start, end);
    }

    get type(): string {
      return type;
    }
  };
  glideConstructorsByType[type] = Variant;
  return Variant;
}

/** The side, direction, edge and stroke words of each variant name, with
 * their flags. */
const glideSides = [
  ["Left", true],
  ["Right", false],
] as const;
const glideDirections = [
  ["Forward", true],
  ["Backward", false],
] as const;
const glideEdges = [
  ["Inside", "inside"],
  ["Outside", "outside"],
  ["", "neither"],
] as const;
const glideStrokes = [
  ["Normal", false],
  ["Crossed", true],
] as const;

/** Human-readable label for each available glide kind. */
export const glideKindChoices: { type: string; label: string }[] = [];

/** Construct the static pose variants: one-foot glides per side, direction
 * and edge, then the two-foot glides (no edge). A declared class of the same
 * name (kept as a type for the tests) takes precedence over the generated
 * variant, so round-trips return that class. */
for (const [side, left] of glideSides) {
  for (const [direction, forward] of glideDirections) {
    for (const [edgeName, edge] of glideEdges) {
      const type = `${side}${direction}${edgeName}Glide`;
      const config: GlideConfig = { forward, leftOnIce: left, rightOnIce: !left, edge };
      if (!glideConstructorsByType[type]) {
        defineGlide(type, config);
      }
      glideKindChoices.push({
        type,
        label: `${side} ${direction.toLowerCase()} ${edge === "neither" ? "" : edge + " "}glide`,
      });
    }
  }
}

// Two-foot glide: both feet on the ice, no edge.
for (const [direction, forward] of glideDirections) {
  const type = `Both${direction}Glide`;
  const config: GlideConfig = { forward, leftOnIce: true, rightOnIce: true, edge: "neither" };
  if (!glideConstructorsByType[type]) {
    defineGlide(type, config);
  }
  glideKindChoices.push({ type, label: `Two-foot ${direction.toLowerCase()} glide` });
}

/** Construct the crossed/normal stroke variants per side, direction, edge
 * and stroke word. */
for (const [side, left] of glideSides) {
  for (const [strokeName, crossed] of glideStrokes) {
    for (const [direction, forward] of glideDirections) {
      for (const [edgeName, edge] of glideEdges) {
        const type = `${side}${strokeName}${direction}${edgeName}Glide`;
        const config = { forward, left, crossed, edge };
        if (!glideConstructorsByType[type]) {
          defineDynamicGlide(type, config);
        }
        glideKindChoices.push({
          type,
          label: `${side} ${strokeName.toLowerCase()} ${direction.toLowerCase()} ${edge === "neither" ? "" : edge + " "}glide`,
        });
      }
    }
  }
}

/** Named glide kind constructors kept for use outside the registry (store,
 * tests), declared as classes so they are usable as instance types.
 * Registering them replaces the generated variants of the same names, so a
 * round-trip through the registry returns these exact classes. */

export class LeftForwardInsideGlide extends Glide {
  constructor(start: PathCoordinate, end: PathCoordinate) {
    super({ forward: true, leftOnIce: true, rightOnIce: false, edge: "inside" }, start, end);
  }

  get type(): string {
    return "LeftForwardInsideGlide";
  }
}

export class LeftForwardOutsideGlide extends Glide {
  constructor(start: PathCoordinate, end: PathCoordinate) {
    super({ forward: true, leftOnIce: true, rightOnIce: false, edge: "outside" }, start, end);
  }

  get type(): string {
    return "LeftForwardOutsideGlide";
  }
}

export class LeftNormalForwardInsideGlide extends DynamicGlide {
  constructor(start: PathCoordinate, end: PathCoordinate) {
    super({ forward: true, left: true, crossed: false, edge: "inside" }, start, end);
  }

  get type(): string {
    return "LeftNormalForwardInsideGlide";
  }
}

export class BothForwardGlide extends Glide {
  constructor(start: PathCoordinate, end: PathCoordinate) {
    super({ forward: true, leftOnIce: true, rightOnIce: true, edge: "neither" }, start, end);
  }

  get type(): string {
    return "BothForwardGlide";
  }
}

// Replace the generated variants by the declared classes of the same names,
// and drop the generated choices in favor of the declared class names (same
// type strings, so the kind choices stay as generated).
glideConstructorsByType["LeftForwardInsideGlide"] = LeftForwardInsideGlide;
glideConstructorsByType["LeftForwardOutsideGlide"] = LeftForwardOutsideGlide;
glideConstructorsByType["LeftNormalForwardInsideGlide"] = LeftNormalForwardInsideGlide;
glideConstructorsByType["BothForwardGlide"] = BothForwardGlide;
