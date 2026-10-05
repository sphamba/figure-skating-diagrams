import { expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import DiagramLegend from "@/components/DiagramLegend.vue";
import en from "@/i18n/messages/en";
import fr from "@/i18n/messages/fr";
import { glideConstructorsByType, type Glide } from "@/engine/element/glide";
import { TimingKeyframe } from "@/engine/keyframe";
import { Sequence } from "@/engine/sequence";
import { Path } from "@/engine/path";
import { Curve } from "@/engine/curve";
import { Vector } from "@/engine/vector";
import type { PathCoordinate } from "@/engine/coordinates";

// A straight path with one glide: the foot of the glide draws its trace on the
// ice while the other foot stays off the ice.
function buildSequence(type = "LeftBackwardOutsideGlide", animated = true, times: [number, number] = [0, 4]): Sequence {
  const path = new Path();
  path.curves.push(new Curve(new Vector(-2.5, 0), new Vector(-0.5, 0), new Vector(0.5, 0), new Vector(2.5, 0)));
  path.updateLength();
  const sequence = new Sequence(path);
  if (animated) {
    // The constructor already places the start timing keyframe at zero.
    sequence.keyframes.time[0]!.value = times[0];
    sequence.addKeyframe("time", new TimingKeyframe(path.length as PathCoordinate, "time", times[1]));
  }
  const constructor = glideConstructorsByType[type] as unknown as new (start: number, end: number) => Glide;
  sequence.addElement(new constructor(0, path.length));
  return sequence;
}

function mountLegend(sequences: Sequence[], timeSeconds: number | null = null): VueWrapper {
  return mount(DiagramLegend, { props: { sequences, timeSeconds, bpm: 120 } });
}

function mountLegendInFrench(): VueWrapper {
  return mount(DiagramLegend, {
    props: { sequences: [], timeSeconds: null, bpm: 120 },
    global: { plugins: [createI18n({ legacy: false, locale: "fr", fallbackLocale: "en", messages: { en, fr } })] },
  });
}

function rowLabels(wrapper: VueWrapper): string[] {
  return wrapper.findAll(".diagram-legend__label").map((label) => label.text());
}

function lineColors(wrapper: VueWrapper): string[] {
  return wrapper.findAll(".diagram-legend__line").map((line) => getComputedStyle(line.element).color);
}

function lineOpacities(wrapper: VueWrapper): string[] {
  return wrapper.findAll(".diagram-legend__line").map((line) => getComputedStyle(line.element).opacity);
}

function dashedRows(wrapper: VueWrapper): boolean[] {
  return wrapper.findAll(".diagram-legend__line").map((line) => line.classes("diagram-legend__line--dashed"));
}

function activeRows(wrapper: VueWrapper): boolean[] {
  return wrapper.findAll(".diagram-legend__row").map((row) => row.classes("diagram-legend__row--active"));
}

test("lists the four foot and direction rows in order", () => {
  const wrapper = mountLegend([]);
  expect(rowLabels(wrapper)).toEqual(["Left Forward", "Left Backward", "Right Forward", "Right Backward"]);
});

test("puts the direction first in French", () => {
  expect(rowLabels(mountLegendInFrench())).toEqual(["Avant gauche", "Arrière gauche", "Avant droit", "Arrière droit"]);
});

test("puts the line sample before the label", () => {
  const row = mountLegend([]).find(".diagram-legend__row").element;
  expect(row.children[0]?.className).toContain("diagram-legend__line");
  expect(row.children[1]?.className).toContain("diagram-legend__label");
});

test("takes the sample colors from the first sequence, or the defaults for an empty list", () => {
  const first = buildSequence();
  first.traceColorL = "#112233";
  first.traceColorR = "#445566";
  const other = buildSequence();
  other.traceColorL = "#ffffff";
  other.traceColorR = "#000000";
  const wrapper = mountLegend([first, other]);
  expect(lineColors(wrapper)).toEqual(["rgb(17, 34, 51)", "rgb(17, 34, 51)", "rgb(68, 85, 102)", "rgb(68, 85, 102)"]);

  const empty = mountLegend([]);
  expect(lineColors(empty)).toEqual(["rgb(48, 48, 210)", "rgb(48, 48, 210)", "rgb(156, 0, 0)", "rgb(156, 0, 0)"]);
});

test("dashes the backward samples and keeps the forward samples solid", () => {
  const wrapper = mountLegend([buildSequence()]);
  expect(dashedRows(wrapper)).toEqual([false, true, false, true]);
});

test("keeps the forward samples at the canvas opacity and the backward samples opaque", () => {
  const wrapper = mountLegend([]);
  expect(lineOpacities(wrapper)).toEqual(["0.7", "1", "0.7", "1"]);
});

test("lights the backward row of the foot on the ice at the current time", () => {
  const wrapper = mountLegend([buildSequence()], 2);
  expect(activeRows(wrapper)).toEqual([false, true, false, false]);
});

test("lights both feet together with the forward rows", () => {
  const wrapper = mountLegend([buildSequence("BothForwardGlide")], 2);
  expect(activeRows(wrapper)).toEqual([true, false, true, false]);
});

test("lights nothing outside the sequence time range", () => {
  const wrapper = mountLegend([buildSequence()], 5);
  expect(activeRows(wrapper)).toEqual([false, false, false, false]);
});

test("lights nothing for a sequence without time evolution", () => {
  const wrapper = mountLegend([buildSequence("LeftBackwardOutsideGlide", false)], 2);
  expect(activeRows(wrapper)).toEqual([false, false, false, false]);
});

test("follows a later visible sequence that still has a cursor", () => {
  const notStarted = buildSequence("RightForwardOutsideGlide", true, [5, 9]);
  const wrapper = mountLegend([notStarted, buildSequence()], 2);
  expect(activeRows(wrapper)).toEqual([false, true, false, false]);
});

test("keeps the highlight on the first visible cursor", () => {
  const wrapper = mountLegend([buildSequence(), buildSequence("RightForwardOutsideGlide")], 2);
  expect(activeRows(wrapper)).toEqual([false, true, false, false]);
});

test("keeps the sample colors on the first visible sequence", () => {
  const notStarted = buildSequence("RightForwardOutsideGlide", true, [5, 9]);
  notStarted.traceColorL = "#112233";
  notStarted.traceColorR = "#445566";
  const wrapper = mountLegend([notStarted, buildSequence()], 2);
  expect(lineColors(wrapper)).toEqual(["rgb(17, 34, 51)", "rgb(17, 34, 51)", "rgb(68, 85, 102)", "rgb(68, 85, 102)"]);
  expect(activeRows(wrapper)).toEqual([false, true, false, false]);
});
