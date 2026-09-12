import type { PathCoordinate } from "../coordinates.js";
import type { FootKey } from "../sequence.js";
import { TwoFeetTurn, defineTwoFeetTurnKinds, type TwoFeetTurnFlags } from "./twoFeetTurn.js";
import { Vector } from "../vector.js";

export abstract class Choctaw extends TwoFeetTurn {
  protected midpointFootAngles(): [number, number] {
    return [this.initialAngle, this.initialAngle + Math.PI];
  }

  protected midpointFootPositions(spacing: number): [Vector<3>, Vector<3>] {
    const offset = this.closed === this.left ? -spacing : spacing;
    return [new Vector<3>(0, offset, 0), new Vector<3>(0, offset, 0)];
  }
}

export type ChoctawConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => Choctaw;

export const choctawConstructorsByType: Record<string, ChoctawConstructor> = {};

export const choctawKindChoices: { type: string; label: string }[] = defineTwoFeetTurnKinds(
  {
    suffix: "Choctaw",
    label: "choctaw",
    shortName: (flags: TwoFeetTurnFlags) => (flags.closed ? "clCho" : "opCho"),
  },
  (type, shortName, flags) => {
    const Variant = class extends Choctaw {
      constructor(footKey: FootKey, start: PathCoordinate, end: PathCoordinate) {
        super(footKey, flags, start, end);
      }

      get type(): string {
        return type;
      }

      get defaultShortName(): string {
        return shortName;
      }
    };
    choctawConstructorsByType[type] = Variant;
  },
);

export const LeftForwardOpenChoctaw = choctawConstructorsByType["LeftForwardOpenChoctaw"]!;
export const LeftForwardClosedChoctaw = choctawConstructorsByType["LeftForwardClosedChoctaw"]!;
export const LeftBackwardOpenChoctaw = choctawConstructorsByType["LeftBackwardOpenChoctaw"]!;
export const LeftBackwardClosedChoctaw = choctawConstructorsByType["LeftBackwardClosedChoctaw"]!;
export const RightForwardOpenChoctaw = choctawConstructorsByType["RightForwardOpenChoctaw"]!;
export const RightForwardClosedChoctaw = choctawConstructorsByType["RightForwardClosedChoctaw"]!;
export const RightBackwardOpenChoctaw = choctawConstructorsByType["RightBackwardOpenChoctaw"]!;
export const RightBackwardClosedChoctaw = choctawConstructorsByType["RightBackwardClosedChoctaw"]!;
