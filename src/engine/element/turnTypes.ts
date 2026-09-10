/* Turn and glide registry: type names, kind choices and helpers. */

import type { PathCoordinate } from "../coordinates.js";
import { glideConstructorsByType, glideKindChoices } from "./glide.js";
// Register the crossing/normal stroke variants into the glide registry.
import "./stroke.js";
import { threeTurnConstructorsByType, threeTurnKindChoices, LeftForwardInsideThreeTurn } from "./threeTurn.js";
import { loopConstructorsByType, loopKindChoices } from "./loop.js";
import type { Element } from "./element.js";
import { footTurnConstructorsByType, changeFootTurnType } from "./turn.js";
import type { FootTurnJSON } from "./turn.js";
import type { FootKey } from "../sequence.js";

/* Fill the FootTurn deserialization registry with the generated turn types. */
Object.assign(footTurnConstructorsByType, threeTurnConstructorsByType, loopConstructorsByType);

/** Human-readable label for each available element (foot turn) kind,
 * generated from the three-turn, loop and glide kind choices. */
export const footTurnKindChoices: { type: string; label: string }[] = [
  ...threeTurnKindChoices,
  ...loopKindChoices,
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
