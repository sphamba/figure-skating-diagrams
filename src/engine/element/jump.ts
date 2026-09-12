import type { PathCoordinate } from "../coordinates.js";
import { Element } from "./element.js";
import { type FootData, FootKeyframe, HipsKeyframe } from "../keyframe.js";
import { offIceFootHeight, halfFeetSpacing } from "./glide.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";

export interface JumpJSON {
  type: string;
  start: PathCoordinate;
  end: PathCoordinate;
  shortName?: string;
}

type JumpConfig = {
  takeOffFoot: "footL" | "footR";
  takeOffForward: boolean;
  takeOffEdge: "inside" | "outside";
  toePick: boolean;
  landFoot: "footL" | "footR";
  rotations: number;
};

export type JumpConstructor = new (start: PathCoordinate, end: PathCoordinate) => Jump;

export abstract class Jump extends Element {
  protected readonly config: JumpConfig;

  abstract readonly type: string;

  constructor(config: JumpConfig, start: PathCoordinate, end: PathCoordinate) {
    super(start, end);
    this.config = config;
  }

  get takeOffFoot(): JumpConfig["takeOffFoot"] {
    return this.config.takeOffFoot;
  }

  get takeOffForward(): boolean {
    return this.config.takeOffForward;
  }

  get takeOffEdge(): JumpConfig["takeOffEdge"] {
    return this.config.takeOffEdge;
  }

  get toePick(): boolean {
    return this.config.toePick;
  }

  get landFoot(): JumpConfig["landFoot"] {
    return this.config.landFoot;
  }

  get rotations(): number {
    return this.config.rotations;
  }

  get scalable(): boolean {
    return true;
  }

  getFootKeyframes(footKey: "footL" | "footR", spanScale?: number, lateralScale?: number): FootKeyframe[] {
    const spacing = (lateralScale ?? 1) * halfFeetSpacing;
    const takeOff = this.takeOffFoot === footKey;
    const travelSign = this.takeOffForward ? 1 : -1;
    const takeOffAngle = this.takeOffForward ? 0 : Math.PI;

    const [start, atTakeOff, atMiddle, atLanding, end] = this.keyframeCoordinates(spanScale);

    const restDataOffIce: FootData = {
      position: new Vector<3>(travelSign * spacing * 2, 0, offIceFootHeight),
      orientation: getQuaternionFromAngleAxis(takeOffAngle + Math.PI / 2),
      contactPoint: 1,
      toePick: false,
    };

    const landedData: FootData = {
      position: new Vector<3>(0, spacing, 0),
      orientation: getQuaternionFromAngleAxis(Math.PI),
      contactPoint: 0.5,
      toePick: false,
    };

    const landedPickData: FootData = {
      position: new Vector<3>(0, spacing, 0),
      orientation: getQuaternionFromAngleAxis(Math.PI),
      contactPoint: 1,
      toePick: true,
    };

    let takeOffKeyframes: FootKeyframe[];
    if (takeOff) {
      const endData = this.landFoot === this.takeOffFoot ? landedData : restDataOffIce;
      takeOffKeyframes = [
        new FootKeyframe(start, {
          position: new Vector<3>(0, -travelSign * spacing, 0),
          orientation: getQuaternionFromAngleAxis(takeOffAngle),
          contactPoint: 0.5,
          toePick: false,
        }),
        new FootKeyframe(atTakeOff, {
          position: new Vector<3>(-spacing, -travelSign * spacing, 0),
          orientation: getQuaternionFromAngleAxis(takeOffAngle + Math.PI / 4),
          contactPoint: 1,
          toePick: false,
        }),
        new FootKeyframe(atMiddle, {
          position: new Vector<3>(0, 0, offIceFootHeight),
          orientation: getQuaternionFromAngleAxis(takeOffAngle + Math.PI / 4),
          contactPoint: 1,
          toePick: false,
        }),
        new FootKeyframe(atLanding, this.landFoot === this.takeOffFoot ? landedPickData : restDataOffIce),
        new FootKeyframe(end, endData),
      ];
    } else {
      const restData: FootData = {
        position: new Vector<3>(travelSign * 0.4, travelSign * spacing, offIceFootHeight),
        orientation: getQuaternionFromAngleAxis(takeOffAngle),
        contactPoint: 0.5,
        toePick: false,
      };
      const pickedData: FootData = {
        ...restData,
        position: new Vector<3>(0, 0, 0),
        contactPoint: 1,
        toePick: true,
      };
      takeOffKeyframes = [
        new FootKeyframe(start, restData),
        new FootKeyframe(atTakeOff, this.config.toePick ? pickedData : restData),
        new FootKeyframe(atMiddle, restData),
        new FootKeyframe(atLanding, this.landFoot === footKey ? landedPickData : restData),
        new FootKeyframe(end, this.landFoot === footKey ? landedData : restData),
      ];
    }
    return takeOffKeyframes;
  }

  private keyframeSpan(spanScale?: number): [PathCoordinate, PathCoordinate] {
    if (spanScale === undefined || spanScale === 1) {
      return [this.start, this.end];
    }
    return this.scaleAboutMiddle(spanScale);
  }

  private keyframeCoordinates(
    spanScale?: number,
  ): [PathCoordinate, PathCoordinate, PathCoordinate, PathCoordinate, PathCoordinate] {
    const [spanStart, spanEnd] = this.keyframeSpan(spanScale);
    const start = spanStart as number;
    const span = (spanEnd as number) - start;
    const at = (fraction: number) => (start + span * fraction) as PathCoordinate;
    return [spanStart, at(0.1), at(0.5), at(0.95), spanEnd];
  }

  getLeftFootKeyframes(spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.getFootKeyframes("footL", spanScale, lateralScale);
  }

  getRightFootKeyframes(spanScale?: number, lateralScale?: number): FootKeyframe[] {
    return this.getFootKeyframes("footR", spanScale, lateralScale);
  }

  getHipsKeyframes(spanScale?: number): HipsKeyframe[] {
    const [start, end] = this.keyframeSpan(spanScale);
    return [
      new HipsKeyframe(
        start,
        { position: new Vector<3>(0, 0, 0), orientation: getQuaternionFromAngleAxis(0) },
        "smooth",
        "smooth",
      ),
      new HipsKeyframe(
        end,
        { position: new Vector<3>(0, 0, 0), orientation: getQuaternionFromAngleAxis(0) },
        "smooth",
        "smooth",
      ),
    ];
  }

  toJSON(): JumpJSON {
    return { type: this.type, start: this.start, end: this.end, shortName: this.shortName };
  }

  static fromJSON(json: JumpJSON): Jump {
    const constructor = jumpConstructorsByType[json.type];
    if (!constructor) {
      throw new Error(`Unknown jump type: ${json.type}`);
    }
    return new constructor(json.start, json.end);
  }
}

export const jumpConstructorsByType: Record<string, JumpConstructor> = {};

function defineJump(type: string, shortName: string, config: JumpConfig): JumpConstructor {
  const Variant = class extends Jump {
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
  jumpConstructorsByType[type] = Variant;
  return Variant;
}

type JumpBase = {
  name: string;
  abbrev: string;
  config: Omit<JumpConfig, "rotations">;
};

const jumpBases: JumpBase[] = [
  {
    name: "ToeLoop",
    abbrev: "T",
    config: {
      takeOffFoot: "footR",
      takeOffForward: false,
      takeOffEdge: "outside",
      toePick: true,
      landFoot: "footR",
    },
  },
  {
    name: "Salchow",
    abbrev: "S",
    config: {
      takeOffFoot: "footL",
      takeOffForward: false,
      takeOffEdge: "inside",
      toePick: false,
      landFoot: "footR",
    },
  },
  {
    name: "Loop",
    abbrev: "Lo",
    config: {
      takeOffFoot: "footR",
      takeOffForward: false,
      takeOffEdge: "outside",
      toePick: false,
      landFoot: "footR",
    },
  },
  {
    name: "Flip",
    abbrev: "F",
    config: {
      takeOffFoot: "footL",
      takeOffForward: false,
      takeOffEdge: "inside",
      toePick: true,
      landFoot: "footR",
    },
  },
  {
    name: "Lutz",
    abbrev: "Lz",
    config: {
      takeOffFoot: "footL",
      takeOffForward: false,
      takeOffEdge: "outside",
      toePick: true,
      landFoot: "footR",
    },
  },
  {
    name: "Axel",
    abbrev: "A",
    config: {
      takeOffFoot: "footL",
      takeOffForward: true,
      takeOffEdge: "outside",
      toePick: false,
      landFoot: "footR",
    },
  },
  {
    name: "Euler",
    abbrev: "Eu",
    config: {
      takeOffFoot: "footR",
      takeOffForward: false,
      takeOffEdge: "outside",
      toePick: false,
      landFoot: "footL",
    },
  },
];

const revolutions = [1, 2, 3, 4];

for (const base of jumpBases) {
  for (const revs of revolutions) {
    defineJump(`${base.name}${revs}`, `${revs}${base.abbrev}`, { ...base.config, rotations: revs });
  }
}

// Longest base names first, so name matching cannot cut a longer name short.
const jumpBaseNames = jumpBases.map((base) => base.name).sort((a, b) => b.length - a.length);

export function parseJumpType(type: string): { jump: string; revolutions: number } | undefined {
  const base = jumpBaseNames.find((name) => type.startsWith(name));
  if (!base) return undefined;
  const revolutionsPart = type.slice(base.length);
  const revs = Number(revolutionsPart);
  if (!revolutions.includes(revs)) return undefined;
  return { jump: base, revolutions: revs };
}
