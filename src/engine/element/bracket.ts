import type { PathCoordinate } from "../coordinates.js";
import type { FootKey } from "../sequence.js";
import { defineOneFootTurnKinds, EdgeTurn } from "./oneFootTurn.js";
import type { FootTurnFlags } from "./turn.js";

export abstract class Bracket extends EdgeTurn {
  protected get counterRotated(): boolean {
    return true;
  }
}

export type BracketConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => Bracket;

export const bracketConstructorsByType: Record<string, BracketConstructor> = {};

export const bracketKindChoices: { type: string; label: string }[] = defineOneFootTurnKinds(
  { suffix: "Bracket", shortSuffix: "B", label: "bracket" },
  (type, shortName, flags: FootTurnFlags) => {
    const Variant = class extends Bracket {
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
    bracketConstructorsByType[type] = Variant;
  },
);

export const LeftForwardInsideBracket = bracketConstructorsByType["LeftForwardInsideBracket"]!;
export const LeftForwardOutsideBracket = bracketConstructorsByType["LeftForwardOutsideBracket"]!;
export const LeftBackwardInsideBracket = bracketConstructorsByType["LeftBackwardInsideBracket"]!;
export const LeftBackwardOutsideBracket = bracketConstructorsByType["LeftBackwardOutsideBracket"]!;
export const RightForwardInsideBracket = bracketConstructorsByType["RightForwardInsideBracket"]!;
export const RightForwardOutsideBracket = bracketConstructorsByType["RightForwardOutsideBracket"]!;
export const RightBackwardInsideBracket = bracketConstructorsByType["RightBackwardInsideBracket"]!;
export const RightBackwardOutsideBracket = bracketConstructorsByType["RightBackwardOutsideBracket"]!;
