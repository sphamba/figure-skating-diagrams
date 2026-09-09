/* Turn and glide registry: type names, kind choices and helpers. */

import type { PathCoordinate } from "../coordinates.js";
import { glideConstructorsByType, glideKindChoices } from "./glide.js";
import { threeTurnConstructorsByType, LeftForwardInsideThreeTurn } from "./threeTurn.js";
import { loopConstructorsByType } from "./loop.js";
import type { Element } from "./element.js";
import { footTurnConstructorsByType, changeFootTurnType } from "./turn.js";
import type { FootTurnJSON } from "./turn.js";
import type { FootKey } from "../sequence.js";

/* Fill the FootTurn deserialization registry with the concrete turn types. */
Object.assign(footTurnConstructorsByType, threeTurnConstructorsByType, loopConstructorsByType);

/** Human-readable label for each available element (foot turn) kind. */
export const footTurnKindChoices: { type: string; label: string }[] = [
  { type: "LeftForwardInsideThreeTurn", label: "Left forward inside three-turn" },
  { type: "LeftForwardOutsideThreeTurn", label: "Left forward outside three-turn" },
  { type: "LeftBackwardInsideThreeTurn", label: "Left backward inside three-turn" },
  { type: "LeftBackwardOutsideThreeTurn", label: "Left backward outside three-turn" },
  { type: "RightForwardInsideThreeTurn", label: "Right forward inside three-turn" },
  { type: "RightForwardOutsideThreeTurn", label: "Right forward outside three-turn" },
  { type: "RightBackwardInsideThreeTurn", label: "Right backward inside three-turn" },
  { type: "RightBackwardOutsideThreeTurn", label: "Right backward outside three-turn" },
  { type: "LeftForwardInsideLoop", label: "Left forward inside loop" },
  { type: "LeftForwardOutsideLoop", label: "Left forward outside loop" },
  { type: "LeftBackwardInsideLoop", label: "Left backward inside loop" },
  { type: "LeftBackwardOutsideLoop", label: "Left backward outside loop" },
  { type: "RightForwardInsideLoop", label: "Right forward inside loop" },
  { type: "RightForwardOutsideLoop", label: "Right forward outside loop" },
  { type: "RightBackwardInsideLoop", label: "Right backward inside loop" },
  { type: "RightBackwardOutsideLoop", label: "Right backward outside loop" },
  ...glideKindChoices,
];

/**
 * The on-ice foot of a one-foot turn type, derived from the Left/Right
 * prefix of the type name. A RightFootTurn turns on the right foot, a
 * LeftFootTurn on the left foot.
 */
function footKeyFromType(type: string): FootKey {
  return type.startsWith("Right") ? "footR" : "footL";
}

/**
 * Build an element of the given type from an existing element's serialized
 * properties (span, and for foot turns foot key derived from the type). For a
 * one-foot turn, the footing foot comes from the Left/Right prefix of the
 * type name. This is how an element is converted from one kind to another
 * without moving it.
 */
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

/**
 * Build a fresh foot turn of the default kind with the given span. Used for
 * provisional, not-yet-added elements.
 */
export function createDefaultFootTurn(start: PathCoordinate, end: PathCoordinate, footKey: FootKey = "footL"): Element {
  return new LeftForwardInsideThreeTurn(footKey, start, end);
}
