// @vitest-environment node
import { expect, test } from "vitest";
import { createI18n } from "vue-i18n";
import fr from "../src/i18n/messages/fr";
import { elementFullName, elementFullNameFr } from "../src/engine/element/fullName.js";
import { glideConstructorsByType } from "../src/engine/element/glide.js";
import { LeftForwardInsideThreeTurn } from "../src/engine/element/threeTurn.js";
import { LeftForwardInsideBracket } from "../src/engine/element/bracket.js";
import { LeftForwardInsideLoop } from "../src/engine/element/loop.js";
import { twizzleConstructorsByType } from "../src/engine/element/twizzle.js";
import { LeftForwardOpenMohawk } from "../src/engine/element/mohawk.js";
import { LeftBackwardClosedChoctaw } from "../src/engine/element/choctaw.js";
import { spinConstructorsByType, type SpinConstructor, type SpinType } from "../src/engine/element/spin.js";
import { jumpConstructorsByType } from "../src/engine/element/jump.js";
import type { Element } from "../src/engine/element/element.js";
import type { FootKey } from "../src/engine/sequence.js";
import type { PathCoordinate } from "../src/engine/coordinates.js";

const i18n = createI18n({ legacy: false, locale: "fr", messages: { fr } });

const start = 0 as PathCoordinate;
const end = 2 as PathCoordinate;

function fullNameFr(element: Element): string {
  return elementFullNameFr(element, i18n.global.t);
}

function glide(typeName: string): Element {
  return new (glideConstructorsByType[typeName] as unknown as new (
    start: PathCoordinate,
    end: PathCoordinate,
  ) => Element)(start, end);
}

function twizzle(typeName: string): Element {
  return new (twizzleConstructorsByType[typeName] as unknown as new (
    footKey: FootKey,
    start: PathCoordinate,
    end: PathCoordinate,
  ) => Element)("footL", start, end);
}

function spin(typeName: string, revolutions: number, spinType?: SpinType): Element {
  return new (spinConstructorsByType[typeName] as SpinConstructor)(start, end, false, spinType, revolutions);
}

function jump(typeName: string): Element {
  return new (jumpConstructorsByType[typeName] as unknown as new (
    start: PathCoordinate,
    end: PathCoordinate,
  ) => Element)(start, end);
}

test("elementFullNameFr names every element family in French word order", () => {
  const cases: [string, Element][] = [
    ["Poussée intérieure avant gauche", glide("LeftNormalForwardInsideGlide")],
    ["Poussée extérieure arrière droite croisée devant", glide("RightCrossedBackwardOutsideGlide")],
    ["Poussée extérieure arrière droite croisée derrière", glide("RightCrossedBackBackwardOutsideGlide")],
    ["Poussée arrière droite", glide("RightNormalBackwardGlide")],
    ["Glissé intérieur avant gauche", glide("LeftForwardInsideGlide")],
    ["Glissé arrière deux pieds", glide("BothBackwardGlide")],
    ["Aigle gauche devant", glide("SpreadEagleLeftFrontGlide")],
    ["Trois intérieur avant gauche", new LeftForwardInsideThreeTurn("footL", start, end)],
    ["Bracket intérieur avant gauche", new LeftForwardInsideBracket("footL", start, end)],
    ["Boucle intérieure avant gauche", new LeftForwardInsideLoop("footL", start, end)],
    ["Twizzle intérieur avant gauche (½ tour)", twizzle("LeftForwardInsideTwizzle0.5")],
    ["Twizzle intérieur avant gauche (2 tours)", twizzle("LeftForwardInsideTwizzle2")],
    ["Mohawk ouvert avant gauche", new LeftForwardOpenMohawk("footL", start, end)],
    ["Choctaw fermé arrière gauche", new LeftBackwardClosedChoctaw("footL", start, end)],
    ["Pirouette debout intérieure pied gauche, 2 révolutions", spin("LeftInsideSpin", 2)],
    ["Pirouette assise intérieure pied gauche, 1 révolution", spin("LeftInsideSpin", 1, "sit")],
    ["Triple boucle piqué", jump("ToeLoop3")],
  ];
  for (const [expected, element] of cases) {
    expect(fullNameFr(element)).toBe(expected);
  }
});

test("elementFullName keeps the English full names", () => {
  expect(elementFullName(glide("LeftNormalForwardInsideGlide"))).toBe("Left normal forward inside stroke");
  expect(elementFullName(glide("RightCrossedBackBackwardOutsideGlide"))).toBe(
    "Crossed-back right backward outside stroke",
  );
  expect(elementFullName(glide("RightNormalBackwardGlide"))).toBe("Right normal backward stroke");
  expect(elementFullName(glide("LeftForwardInsideGlide"))).toBe("Left forward inside glide");
  expect(elementFullName(glide("BothBackwardGlide"))).toBe("Two-feet backward glide");
});
