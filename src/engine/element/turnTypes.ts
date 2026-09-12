import type { PathCoordinate } from "../coordinates.js";
import { glideConstructorsByType, glideKindChoices } from "./glide.js";
import "./stroke.js";
import { threeTurnConstructorsByType, threeTurnKindChoices, LeftForwardInsideThreeTurn } from "./threeTurn.js";
import { loopConstructorsByType, loopKindChoices } from "./loop.js";
import { twizzleConstructorsByType, twizzleKindChoices } from "./twizzle.js";
import { bracketConstructorsByType, bracketKindChoices } from "./bracket.js";
import { rockerConstructorsByType, rockerKindChoices } from "./rocker.js";
import { counterConstructorsByType, counterKindChoices } from "./counter.js";
import { mohawkConstructorsByType, mohawkKindChoices } from "./mohawk.js";
import { choctawConstructorsByType, choctawKindChoices } from "./choctaw.js";
import { jumpConstructorsByType } from "./jump.js";
import type { Jump } from "./jump.js";
import type { Element } from "./element.js";
import { footTurnConstructorsByType, changeFootTurnType } from "./turn.js";
import type { FootTurnJSON } from "./turn.js";
import type { FootKey } from "../sequence.js";

Object.assign(
  footTurnConstructorsByType,
  threeTurnConstructorsByType,
  loopConstructorsByType,
  twizzleConstructorsByType,
  bracketConstructorsByType,
  rockerConstructorsByType,
  counterConstructorsByType,
  mohawkConstructorsByType,
  choctawConstructorsByType,
);

export const footTurnKindChoices: { type: string; label: string }[] = [
  ...threeTurnKindChoices,
  ...bracketKindChoices,
  ...rockerKindChoices,
  ...counterKindChoices,
  ...loopKindChoices,
  ...twizzleKindChoices,
  ...mohawkKindChoices,
  ...choctawKindChoices,
  ...glideKindChoices,
];

function footKeyFromType(type: string): FootKey {
  return type.startsWith("Right") ? "footR" : "footL";
}

export function isJumpType(type: string): boolean {
  return type in jumpConstructorsByType;
}

export { parseJumpType } from "./jump.js";

export const jumpTypeChoices: { value: string; label: string }[] = [
  { value: "ToeLoop", label: "Toe loop" },
  { value: "Salchow", label: "Salchow" },
  { value: "Loop", label: "Loop" },
  { value: "Flip", label: "Flip" },
  { value: "Lutz", label: "Lutz" },
  { value: "Axel", label: "Axel" },
  { value: "Euler", label: "Euler" },
];

export function changeElementType(
  type: string,
  template: {
    type: string;
    start: number;
    end: number;
    footKey?: string;
    shortName?: string;
    leftHanded?: boolean;
  },
): Element {
  const start = template.start as PathCoordinate;
  const end = template.end as PathCoordinate;
  const glideConstructor = glideConstructorsByType[type];
  const element = glideConstructor
    ? new glideConstructor(start, end)
    : isJumpType(type)
      ? new (jumpConstructorsByType[type] as new (
          start: PathCoordinate,
          end: PathCoordinate,
          leftHanded?: boolean,
        ) => Jump)(start, end, template.leftHanded)
      : changeFootTurnType(type, {
          ...template,
          start,
          end,
          type,
          footKey: footKeyFromType(type),
        } as FootTurnJSON);
  if (typeof template.shortName === "string") element.shortName = template.shortName;
  return element;
}

export function createDefaultFootTurn(start: PathCoordinate, end: PathCoordinate, footKey: FootKey = "footL"): Element {
  return new LeftForwardInsideThreeTurn(footKey, start, end);
}
