import type { PathCoordinate } from "../coordinates.js";
import { glideConstructorsByType, glideKindChoices } from "./glide.js";
import "./stroke.js";
import { threeTurnConstructorsByType, threeTurnKindChoices, LeftForwardInsideThreeTurn } from "./threeTurn.js";
import { loopConstructorsByType, loopKindChoices } from "./loop.js";
import { bracketConstructorsByType, bracketKindChoices } from "./bracket.js";
import { rockerConstructorsByType, rockerKindChoices } from "./rocker.js";
import { counterConstructorsByType, counterKindChoices } from "./counter.js";
import type { Element } from "./element.js";
import { footTurnConstructorsByType, changeFootTurnType } from "./turn.js";
import type { FootTurnJSON } from "./turn.js";
import type { FootKey } from "../sequence.js";

Object.assign(
  footTurnConstructorsByType,
  threeTurnConstructorsByType,
  loopConstructorsByType,
  bracketConstructorsByType,
  rockerConstructorsByType,
  counterConstructorsByType,
);

export const footTurnKindChoices: { type: string; label: string }[] = [
  ...threeTurnKindChoices,
  ...bracketKindChoices,
  ...rockerKindChoices,
  ...counterKindChoices,
  ...loopKindChoices,
  ...glideKindChoices,
];

function footKeyFromType(type: string): FootKey {
  return type.startsWith("Right") ? "footR" : "footL";
}

export function changeElementType(
  type: string,
  template: {
    type: string;
    start: number;
    end: number;
    footKey?: string;
  },
): Element {
  const start = template.start as PathCoordinate;
  const end = template.end as PathCoordinate;
  const glideConstructor = glideConstructorsByType[type];
  if (glideConstructor) {
    return new glideConstructor(start, end);
  }
  return changeFootTurnType(type, {
    ...template,
    start,
    end,
    type,
    footKey: footKeyFromType(type),
  } as FootTurnJSON);
}

export function createDefaultFootTurn(start: PathCoordinate, end: PathCoordinate, footKey: FootKey = "footL"): Element {
  return new LeftForwardInsideThreeTurn(footKey, start, end);
}
