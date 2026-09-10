import type { PathCoordinate } from "../coordinates.js";
import type { FootKey } from "../sequence.js";
import { defineOneFootTurnKinds, EdgeTurn } from "./oneFootTurn.js";
import type { FootTurnFlags } from "./turn.js";

export abstract class Counter extends EdgeTurn {
  protected get counterRotated(): boolean {
    return true;
  }
}

export type CounterConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => Counter;

export const counterConstructorsByType: Record<string, CounterConstructor> = {};

export const counterKindChoices: { type: string; label: string }[] = defineOneFootTurnKinds(
  { suffix: "Counter", shortSuffix: " CTR", label: "counter" },
  (type, shortName, flags: FootTurnFlags) => {
    const Variant = class extends Counter {
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
    counterConstructorsByType[type] = Variant;
  },
);

export const LeftForwardInsideCounter = counterConstructorsByType["LeftForwardInsideCounter"]!;
export const LeftForwardOutsideCounter = counterConstructorsByType["LeftForwardOutsideCounter"]!;
export const LeftBackwardInsideCounter = counterConstructorsByType["LeftBackwardInsideCounter"]!;
export const LeftBackwardOutsideCounter = counterConstructorsByType["LeftBackwardOutsideCounter"]!;
export const RightForwardInsideCounter = counterConstructorsByType["RightForwardInsideCounter"]!;
export const RightForwardOutsideCounter = counterConstructorsByType["RightForwardOutsideCounter"]!;
export const RightBackwardInsideCounter = counterConstructorsByType["RightBackwardInsideCounter"]!;
export const RightBackwardOutsideCounter = counterConstructorsByType["RightBackwardOutsideCounter"]!;
