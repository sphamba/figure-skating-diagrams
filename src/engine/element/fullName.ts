import type { Element, ElementNameParts } from "./element.js";
import { footTurnKindChoices, isJumpType, jumpTypeChoices, parseJumpType } from "./turnTypes.js";
import { Spin, spinKindChoices } from "./spin.js";
import { turnsNumeral } from "./twizzle.js";

const revolutionWords: Record<number, string> = {
  1: "Single",
  2: "Double",
  3: "Triple",
  4: "Quadruple",
};

function revolutionsText(revolutions: number): string {
  return `${revolutions} revolution${revolutions === 1 ? "" : "s"}`;
}

export function elementFullName(element: Element): string {
  if (isJumpType(element.type)) {
    const parsed = parseJumpType(element.type);
    if (parsed) {
      const label = jumpTypeChoices.find((choice) => choice.value === parsed.jump)?.label ?? parsed.jump;
      const word = revolutionWords[parsed.revolutions] ?? `${parsed.revolutions}-revolutions`;
      return `${word} ${label.toLowerCase()}`;
    }
  } else if (element instanceof Spin) {
    const label = spinKindChoices.find((choice) => choice.type === element.type)?.label;
    if (label) return `${label}, ${element.spinType} spin, ${revolutionsText(element.revolutions)}`;
  } else {
    const label = footTurnKindChoices.find((choice) => choice.type === element.type)?.label;
    if (label) return label;
  }
  return element.type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

export type ElementNameTranslator = (key: string, named?: Record<string, unknown>) => string;

const jumpRevolutionKeys: Record<number, string> = {
  1: "single",
  2: "double",
  3: "triple",
  4: "quadruple",
};

function elementNameWord(t: ElementNameTranslator, key: string | undefined): string | undefined {
  return key ? t(`elementName.${key}`) : undefined;
}

function edgeWord(
  t: ElementNameTranslator,
  edge: "inside" | "outside" | undefined,
  feminine: boolean,
): string | undefined {
  if (!edge) return undefined;
  if (edge === "inside") return elementNameWord(t, feminine ? "edgeInsideF" : "edgeInside");
  return elementNameWord(t, feminine ? "edgeOutsideF" : "edgeOutside");
}

function strokeCrossingWord(
  t: ElementNameTranslator,
  stroke: "normal" | "crossed" | "crossedBack" | undefined,
): string | undefined {
  if (!stroke || stroke === "normal") return undefined;
  return elementNameWord(t, stroke === "crossed" ? "crossedFront" : "crossedBack");
}

function joinWords(words: (string | undefined)[]): string {
  return words.filter((word): word is string => word !== undefined).join(" ");
}

function composedNameWords(parts: ElementNameParts, element: Element, t: ElementNameTranslator): string {
  switch (parts.kind) {
    case "glide":
      return joinWords([
        elementNameWord(t, "glide"),
        edgeWord(t, parts.edge, false),
        elementNameWord(t, parts.direction),
        elementNameWord(t, parts.side),
      ]);
    case "glideTwoFeet":
      return joinWords([
        elementNameWord(t, "glide"),
        elementNameWord(t, parts.direction),
        elementNameWord(t, "twoFeet"),
      ]);
    case "pose":
      return joinWords([
        elementNameWord(t, parts.pose),
        elementNameWord(t, parts.frontFoot),
        elementNameWord(t, "front"),
      ]);
    case "stroke":
      return joinWords([
        elementNameWord(t, "stroke"),
        edgeWord(t, parts.edge, true),
        elementNameWord(t, parts.direction),
        elementNameWord(t, parts.side),
        strokeCrossingWord(t, parts.stroke),
      ]);
    case "turn":
      return joinWords([
        elementNameWord(t, parts.turn),
        edgeWord(t, parts.edge, parts.turn === "loop"),
        elementNameWord(t, parts.direction),
        elementNameWord(t, parts.side),
      ]);
    case "twizzle":
      return joinWords([
        elementNameWord(t, "twizzle"),
        edgeWord(t, parts.edge, false),
        elementNameWord(t, parts.direction),
        elementNameWord(t, parts.side),
        `(${turnsNumeral(parts.turns!)} ${t("editor.turnUnit", { count: parts.turns === 0.5 || parts.turns === 1 ? 1 : 2 })})`,
      ]);
    case "twoFeetTurn":
      return joinWords([
        elementNameWord(t, parts.turn),
        elementNameWord(t, parts.openness),
        elementNameWord(t, parts.direction),
        elementNameWord(t, parts.side),
      ]);
    case "spin": {
      if (!(element instanceof Spin)) return elementFullName(element);
      return (
        joinWords([
          elementNameWord(t, "spin"),
          elementNameWord(t, element.spinType),
          edgeWord(t, parts.edge, true),
          elementNameWord(t, parts.side === "left" ? "leftFoot" : "rightFoot"),
        ]) + `, ${t("editor.spins.revolutionsCount", { count: element.revolutions })}`
      );
    }
  }
}

export function elementFullNameFr(element: Element, t: ElementNameTranslator): string {
  if (isJumpType(element.type)) {
    const parsed = parseJumpType(element.type);
    const choice = parsed ? jumpTypeChoices.find((entry) => entry.value === parsed.jump) : undefined;
    if (!parsed || !choice) return elementFullName(element);
    const revolutionKey = jumpRevolutionKeys[parsed.revolutions];
    const revolutionWord = revolutionKey ? t(`editor.jumps.${revolutionKey}`) : `${parsed.revolutions} revolutions`;
    const jumpNoun = t(`editor.jumps.${choice.key}`);
    return `${revolutionWord} ${jumpNoun.charAt(0).toLowerCase()}${jumpNoun.slice(1)}`;
  }
  const parts =
    footTurnKindChoices.find((choice) => choice.type === element.type)?.parts ??
    spinKindChoices.find((choice) => choice.type === element.type)?.parts;
  if (!parts) return elementFullName(element);
  return composedNameWords(parts, element, t);
}
