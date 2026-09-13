import type { PathCoordinate } from "../coordinates.js";
import { Element } from "./element.js";
import { type FootData, FootKeyframe, HipsKeyframe } from "../keyframe.js";
import { offIceFootHeight } from "./glide.js";
import { bladeLength } from "../constants.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import type { Quaternion } from "../quaternion.js";

export const halfBladeLength = bladeLength / 2;

export const spinTypes = ["upright", "layback", "camel", "sit"] as const;
export type SpinType = (typeof spinTypes)[number];

export const spinTypeShortNames: Record<SpinType, string> = {
  upright: "USp",
  layback: "LSp",
  camel: "CSp",
  sit: "SSp",
};

export interface SpinJSON {
  type: string;
  start: PathCoordinate;
  end: PathCoordinate;
  shortName?: string;
  leftHanded?: boolean;
  spinType?: SpinType;
}

type SpinConfig = {
  leftFoot: boolean;
  inside: boolean;
  spinType: SpinType;
};

export type SpinConstructor = new (
  start: PathCoordinate,
  end: PathCoordinate,
  leftHanded?: boolean,
  spinType?: SpinType,
) => Spin;

export abstract class Spin extends Element {
  private readonly config: SpinConfig;
  private readonly mirrored: boolean;

  abstract readonly type: string;

  constructor(config: SpinConfig, start: PathCoordinate, end: PathCoordinate, leftHanded = false) {
    super(start, end);
    this.config = config;
    this.mirrored = leftHanded;
  }

  get leftHanded(): boolean {
    return this.mirrored;
  }

  get rightHanded(): boolean {
    return !this.mirrored;
  }

  get onIceFoot(): "footL" | "footR" {
    return this.config.leftFoot ? "footL" : "footR";
  }

  get inside(): boolean {
    return this.config.inside;
  }

  get spinType(): SpinType {
    return this.config.spinType;
  }

  getLeftFootKeyframes(_spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.createFootKeyframes("footL", lateralScale);
  }

  getRightFootKeyframes(_spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.createFootKeyframes("footR", lateralScale);
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

  toJSON(): SpinJSON {
    return {
      type: this.type,
      start: this.start,
      end: this.end,
      shortName: this.shortName,
      leftHanded: this.leftHanded,
      spinType: this.spinType,
    };
  }

  static fromJSON(json: SpinJSON): Spin {
    const constructor = spinConstructorsByType[json.type];
    if (!constructor) {
      throw new Error(`Unknown spin type: ${json.type}`);
    }
    return new constructor(json.start, json.end, json.leftHanded, json.spinType);
  }

  // An inside edge is the weight on the toe-side of the blade, an outside edge
  // on the heel-side. With the on-ice foot oriented backwards, this maps to the
  // path frame as +y for either of these cases:
  // - the left foot on an inside edge
  // - the right foot on an outside edge
  // The shift always goes to the corresponding edge. Handedness does not move
  // the foot; it only sets the "spins" attribute.
  private get shiftSign(): number {
    const leftFoot = this.onIceFoot === "footL";
    return this.inside === leftFoot ? 1 : -1;
  }

  // The on-ice foot orientation depends on foot and edge:
  // - a left-inside or right-outside spin traces backwards
  // - a left-outside or right-inside spin traces forwards
  // A left-handed spin switches forward and backwards.
  private get backwardOrientation(): boolean {
    const leftFoot = this.onIceFoot === "footL";
    const backward = this.inside === leftFoot;
    return this.rightHanded ? backward : !backward;
  }

  private get onIceOrientation(): Quaternion {
    return getQuaternionFromAngleAxis(this.backwardOrientation ? Math.PI : 0);
  }

  private createFootKeyframes(footKey: "footL" | "footR", lateralScale?: number): FootKeyframe[] {
    const [start, middle, end] = [this.start, this.middle, this.end];
    const scale = lateralScale ?? 1;
    const onIce = footKey === this.onIceFoot;
    if (!onIce) {
      const restData: FootData = {
        position: new Vector<3>(0, 0, offIceFootHeight),
        orientation: getQuaternionFromAngleAxis(Math.PI),
        contactPoint: 0.5,
        toePick: false,
        spins: 0,
      };
      return [
        new FootKeyframe(start, restData, "smooth", "smooth"),
        new FootKeyframe(end, restData, "smooth", "smooth"),
      ];
    }
    const orientation = this.onIceOrientation;
    const restData: FootData = {
      position: new Vector<3>(0, 0, 0),
      orientation,
      contactPoint: 0.5,
      toePick: false,
      spins: 0,
    };
    const spinData: FootData = {
      ...restData,
      spinShift: this.shiftSign * halfBladeLength * scale,
      spins: this.rightHanded ? 1 : -1,
    };
    return [
      new FootKeyframe(start, restData, "smooth", "smooth"),
      new FootKeyframe(middle, spinData, "smooth", "smooth"),
      new FootKeyframe(end, restData, "smooth", "smooth"),
    ];
  }

  private get middle(): PathCoordinate {
    return (((this.start as number) + (this.end as number)) / 2) as PathCoordinate;
  }
}

export const spinConstructorsByType: Record<string, SpinConstructor> = {};
export const spinConfigsByType: Record<string, SpinConfig> = {};

export function parseSpinType(type: string): { type: string; leftFoot: boolean; inside: boolean } | undefined {
  const flags = spinConfigsByType[type];
  return flags ? { type, leftFoot: flags.leftFoot, inside: flags.inside } : undefined;
}

export function isSpinType(type: string): boolean {
  return type in spinConstructorsByType;
}

export const spinSides = [
  ["Left", true],
  ["Right", false],
] as const;
export const spinEdges = [
  ["Inside", true],
  ["Outside", false],
] as const;

export const spinKindChoices: { type: string; label: string }[] = [];

for (const [side, leftFoot] of spinSides) {
  for (const [edgeName, inside] of spinEdges) {
    const type = `${side}${edgeName}Spin`;
    const flags: SpinConfig = { leftFoot, inside, spinType: "upright" };
    const shortName = spinTypeShortNames[flags.spinType];
    const Variant = class extends Spin {
      constructor(start: PathCoordinate, end: PathCoordinate, leftHanded = false, spinType?: SpinType) {
        super(spinType ? { ...flags, spinType } : flags, start, end, leftHanded);
      }

      get type(): string {
        return type;
      }

      get defaultShortName(): string {
        return shortName;
      }
    };
    spinConstructorsByType[type] = Variant as unknown as SpinConstructor;
    spinConfigsByType[type] = flags;
    spinKindChoices.push({
      type,
      label: `${side.toLowerCase()}foot ${edgeName.toLowerCase()}-edge spin`,
    });
  }
}
