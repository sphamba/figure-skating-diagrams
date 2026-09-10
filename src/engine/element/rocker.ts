import type { PathCoordinate } from "../coordinates.js";
import type { FootKey } from "../sequence.js";
import { defineOneFootTurnKinds, EdgeTurn } from "./oneFootTurn.js";
import type { FootTurnFlags } from "./turn.js";

export abstract class Rocker extends EdgeTurn {
  protected get counterRotated(): boolean {
    return false;
  }
}

export type RockerConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => Rocker;

export const rockerConstructorsByType: Record<string, RockerConstructor> = {};

export const rockerKindChoices: { type: string; label: string }[] = defineOneFootTurnKinds(
  { suffix: "Rocker", shortSuffix: " RO", label: "rocker" },
  (type, shortName, flags: FootTurnFlags) => {
    const Variant = class extends Rocker {
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
    rockerConstructorsByType[type] = Variant;
  },
);

export const LeftForwardInsideRocker = rockerConstructorsByType["LeftForwardInsideRocker"]!;
export const LeftForwardOutsideRocker = rockerConstructorsByType["LeftForwardOutsideRocker"]!;
export const LeftBackwardInsideRocker = rockerConstructorsByType["LeftBackwardInsideRocker"]!;
export const LeftBackwardOutsideRocker = rockerConstructorsByType["LeftBackwardOutsideRocker"]!;
export const RightForwardInsideRocker = rockerConstructorsByType["RightForwardInsideRocker"]!;
export const RightForwardOutsideRocker = rockerConstructorsByType["RightForwardOutsideRocker"]!;
export const RightBackwardInsideRocker = rockerConstructorsByType["RightBackwardInsideRocker"]!;
export const RightBackwardOutsideRocker = rockerConstructorsByType["RightBackwardOutsideRocker"]!;
