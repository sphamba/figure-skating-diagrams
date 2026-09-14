import type { Element } from "./element.js";
import { footTurnKindChoices, isJumpType, jumpTypeChoices, parseJumpType } from "./turnTypes.js";
import { Spin, spinKindChoices } from "./spin.js";

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
