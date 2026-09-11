import type { PathCoordinate } from "../coordinates.js";
import type { FootKey } from "../sequence.js";
import { TwoFeetTurn, defineTwoFeetTurnKinds, type TwoFeetTurnFlags } from "./twoFeetTurn.js";
import { Vector } from "../vector.js";

export abstract class Mohawk extends TwoFeetTurn {
  protected midpointFootAngles(): [number, number] {
    const angleBetweenFeet = this.forward ? Math.PI / 2 : Math.PI;
    const angleA = this.initialAngle + this.rotationSign * (Math.PI / 2 - angleBetweenFeet / 2);
    const angleB = this.initialAngle + this.rotationSign * (Math.PI / 2 + angleBetweenFeet / 2);
    return [angleA, angleB];
  }

  protected midpointFootPositions(spacing: number): [Vector<3>, Vector<3>] {
    const positionA = new Vector<3>(spacing, 0, 0);
    const positionB = new Vector<3>(spacing, 0, 0);
    return [positionA, positionB];
  }
}

export type MohawkConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => Mohawk;

export const mohawkConstructorsByType: Record<string, MohawkConstructor> = {};

export const mohawkKindChoices: { type: string; label: string }[] = defineTwoFeetTurnKinds(
  {
    suffix: "Mohawk",
    label: "mohawk",
    shortName: (flags: TwoFeetTurnFlags) => (flags.closed ? "MO" : "opMo"),
  },
  (type, shortName, flags) => {
    const Variant = class extends Mohawk {
      constructor(footKey: FootKey, start: PathCoordinate, end: PathCoordinate) {
        super(footKey, flags, start, end);
      }

      get type(): string {
        return type;
      }

      get shortName(): string {
        return shortName;
      }
    };
    mohawkConstructorsByType[type] = Variant;
  },
);

export const LeftForwardOpenMohawk = mohawkConstructorsByType["LeftForwardOpenMohawk"]!;
export const LeftForwardClosedMohawk = mohawkConstructorsByType["LeftForwardClosedMohawk"]!;
export const LeftBackwardOpenMohawk = mohawkConstructorsByType["LeftBackwardOpenMohawk"]!;
export const LeftBackwardClosedMohawk = mohawkConstructorsByType["LeftBackwardClosedMohawk"]!;
export const RightForwardOpenMohawk = mohawkConstructorsByType["RightForwardOpenMohawk"]!;
export const RightForwardClosedMohawk = mohawkConstructorsByType["RightForwardClosedMohawk"]!;
export const RightBackwardOpenMohawk = mohawkConstructorsByType["RightBackwardOpenMohawk"]!;
export const RightBackwardClosedMohawk = mohawkConstructorsByType["RightBackwardClosedMohawk"]!;
