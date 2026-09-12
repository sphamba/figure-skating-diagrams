import type { PathCoordinate } from "../coordinates.js";
import type { FootKey } from "../sequence.js";
import { defineOneFootTurnKinds, EdgeTurn } from "./oneFootTurn.js";
import type { FootTurnFlags } from "./turn.js";

export abstract class ThreeTurn extends EdgeTurn {
  protected get counterRotated(): boolean {
    return false;
  }
}

export type ThreeTurnConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => ThreeTurn;

export const threeTurnConstructorsByType: Record<string, ThreeTurnConstructor> = {};

export const threeTurnKindChoices: { type: string; label: string }[] = defineOneFootTurnKinds(
  { suffix: "ThreeTurn", shortSuffix: "3", label: "three-turn" },
  (type, shortName, flags: FootTurnFlags) => {
    const Variant = class extends ThreeTurn {
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
    threeTurnConstructorsByType[type] = Variant;
  },
);

export const LeftForwardInsideThreeTurn = threeTurnConstructorsByType["LeftForwardInsideThreeTurn"]!;
export const LeftForwardOutsideThreeTurn = threeTurnConstructorsByType["LeftForwardOutsideThreeTurn"]!;
export const LeftBackwardInsideThreeTurn = threeTurnConstructorsByType["LeftBackwardInsideThreeTurn"]!;
export const LeftBackwardOutsideThreeTurn = threeTurnConstructorsByType["LeftBackwardOutsideThreeTurn"]!;
export const RightForwardInsideThreeTurn = threeTurnConstructorsByType["RightForwardInsideThreeTurn"]!;
export const RightForwardOutsideThreeTurn = threeTurnConstructorsByType["RightForwardOutsideThreeTurn"]!;
export const RightBackwardInsideThreeTurn = threeTurnConstructorsByType["RightBackwardInsideThreeTurn"]!;
export const RightBackwardOutsideThreeTurn = threeTurnConstructorsByType["RightBackwardOutsideThreeTurn"]!;
