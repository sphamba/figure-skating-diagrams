import { expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import TimeSyncPane from "@/components/TimeSyncPane.vue";
import en from "@/i18n/messages/en";
import fr from "@/i18n/messages/fr";
import { BothForwardGlide, glideConstructorsByType } from "@/engine/element/glide";
import { DynamicGlide } from "@/engine/element/stroke";
import { Annotation } from "@/engine/annotation";
import { TimingKeyframe } from "@/engine/keyframe";
import { Sequence } from "@/engine/sequence";
import { Path } from "@/engine/path";
import { Curve } from "@/engine/curve";
import { Vector } from "@/engine/vector";
import type { PathCoordinate } from "@/engine/coordinates";

function buildSequence(): Sequence {
  const path = new Path();
  path.curves.push(new Curve(new Vector(-2.5, 0), new Vector(-0.5, 0), new Vector(0.5, 0), new Vector(2.5, 0)));
  path.updateLength();
  const sequence = new Sequence(path);
  sequence.addKeyframe("time", new TimingKeyframe(0 as PathCoordinate, "time", 0));
  sequence.addKeyframe("time", new TimingKeyframe(path.length as PathCoordinate, "time", 4));
  sequence.addElement(new BothForwardGlide(0 as PathCoordinate, path.length as PathCoordinate));
  sequence.addAnnotation(new Annotation((path.length - 0.5) as PathCoordinate, path.length as PathCoordinate));
  return sequence;
}

async function openPane(
  sequences: Sequence[],
  time: number | null,
  loopWindow: [number, number] | null = null,
): Promise<HTMLElement | null> {
  const wrapper = mount(TimeSyncPane, { props: { sequences, timeSeconds: time, bpm: 120, loopWindow } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const content = wrapper.find(".time-sync-pane").element as HTMLElement | null;
  wrapper.unmount();
  return content;
}

test("shows the annotation title while the cursor is within the sequence", async () => {
  const content = await openPane([buildSequence()], 3.9);
  expect(content).not.toBeNull();
  const text = content?.textContent ?? "";
  expect(text).toContain("Annotation");
  // The row starts unfolded, so the description shows with the title.
  expect(text).toContain("No description");
  expect(text).not.toContain("(");
  expect(text).not.toContain("Nothing at the time cursor");
});

test("hides annotations and elements when the cursor is beyond the sequence end", async () => {
  const content = await openPane([buildSequence()], 4.5);
  expect(content).not.toBeNull();
  expect(content?.querySelector(".time-sync-pane__empty")?.textContent).toContain("No element yet");
});

function buildFallbackSequence(): Sequence {
  const path = new Path();
  path.curves.push(new Curve(new Vector(-2.5, 0), new Vector(-0.5, 0), new Vector(0.5, 0), new Vector(2.5, 0)));
  path.updateLength();
  const sequence = new Sequence(path);
  sequence.addKeyframe("time", new TimingKeyframe(0 as PathCoordinate, "time", 0));
  sequence.addKeyframe("time", new TimingKeyframe(path.length as PathCoordinate, "time", 9));
  const third = (path.length / 3) as PathCoordinate;
  const twoThirds = ((path.length * 2) / 3) as PathCoordinate;
  const first = new BothForwardGlide(0 as PathCoordinate, third);
  const second = new BothForwardGlide(third, twoThirds);
  const last = new BothForwardGlide(twoThirds, path.length as PathCoordinate);
  second.shortName = "B";
  last.shortName = "C";
  sequence.addElement(first);
  sequence.addElement(second);
  sequence.addElement(last);
  return sequence;
}

test("hides the annotation description after the arrow folds the row", async () => {
  const wrapper = mount(TimeSyncPane, {
    attachTo: document.body,
    props: { sequences: [buildSequence()], timeSeconds: 3.9, bpm: 120 },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  // The row starts unfolded, so the description shows below the title.
  const detail = document.body.querySelector(".time-sync-pane__detail");
  expect(detail).not.toBeNull();
  expect(detail?.textContent).toContain("No description");
  // The annotations accordion sits below the elements accordion.
  const toggle = document.body.querySelector(".time-sync-pane__annotation-header .time-sync-pane__toggle");
  toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const detailHidden = document.body.querySelector(".time-sync-pane__detail");
  expect(detailHidden === null || detailHidden.style.display === "none").toBe(true);
  wrapper.unmount();
});

test("hides the current element full name after the arrow folds the strip", async () => {
  const wrapper = mount(TimeSyncPane, {
    attachTo: document.body,
    props: { sequences: [buildFallbackSequence()], timeSeconds: 4.5, bpm: 120 },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const chips = document.body.querySelectorAll("button.time-sync-pane__chip--element");
  const first = chips[0];
  expect(first?.textContent).toContain("B");
  // The strip starts unfolded, so the current element full name shows below.
  const fullname = document.body.querySelector(".time-sync-pane__strip-fullname");
  expect(fullname).not.toBeNull();
  expect(fullname?.textContent).toContain("Two-feet forward glide");
  // The elements accordion is first, so the first toggle folds its strip.
  const arrow = document.body.querySelector(".time-sync-pane__toggle");
  expect(arrow).not.toBeNull();
  arrow?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const chipsAfter = document.body.querySelectorAll("button.time-sync-pane__chip--element");
  expect(chipsAfter[0]?.textContent).toContain("B");
  const detailHidden = document.body.querySelector(".time-sync-pane__strip-fullname");
  expect(detailHidden === null || detailHidden.style.display === "none").toBe(true);
  wrapper.unmount();
});

function elementChips(root: HTMLElement | null): HTMLButtonElement[] {
  return Array.from(root?.querySelectorAll("button.time-sync-pane__chip--element") ?? []);
}

function crossedStroke(type: string, start: number, end: number): DynamicGlide {
  const constructor = glideConstructorsByType[type] as unknown as new (start: number, end: number) => DynamicGlide;
  return new constructor(start, end);
}

// An S-shaped curve: the curvature changes sign at half its length.
function buildSSequence(): Sequence {
  const path = new Path();
  path.curves.push(new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(1, 1), new Vector(2, 1)));
  path.updateLength();
  const sequence = new Sequence(path);
  sequence.addKeyframe("time", new TimingKeyframe(0 as PathCoordinate, "time", 0));
  sequence.addKeyframe("time", new TimingKeyframe(path.length as PathCoordinate, "time", 4));
  return sequence;
}

function buildStraightSequence(): Sequence {
  const path = new Path();
  path.curves.push(new Curve(new Vector(-2.5, 0), new Vector(-0.5, 0), new Vector(0.5, 0), new Vector(2.5, 0)));
  path.updateLength();
  const sequence = new Sequence(path);
  sequence.addKeyframe("time", new TimingKeyframe(0 as PathCoordinate, "time", 0));
  sequence.addKeyframe("time", new TimingKeyframe(path.length as PathCoordinate, "time", 4));
  return sequence;
}

function chipByLabel(root: HTMLElement | null, label: string): HTMLButtonElement | undefined {
  return elementChips(root).find((chip) => chip.textContent?.trim() === label);
}

test("shows a CE chip at the time of an uncovered inflection", async () => {
  const sequence = buildSSequence();
  const length = sequence.path.length;
  const element = new BothForwardGlide((0.6 * length) as PathCoordinate, length as PathCoordinate);
  element.shortName = "G";
  sequence.addElement(element);
  const content = await openPane([sequence], 2.2);
  const labels = elementChips(content).map((chip) => chip.textContent?.trim());
  expect(labels).toContain("CE");
  expect(labels).toContain("G");
  // The CE chip renders like the element chips, with the same font size.
  const ce = chipByLabel(content, "CE");
  expect(ce).toBeDefined();
  const styleClasses = (chip: HTMLButtonElement) =>
    chip.className
      .split(" ")
      .filter((name) => name !== "time-sync-pane__chip--dim")
      .sort()
      .join(" ");
  expect(styleClasses(ce!)).toBe(styleClasses(chipByLabel(content, "G")!));
});

test("seeks to the inflection time when the CE chip is clicked", async () => {
  const sequence = buildSSequence();
  const length = sequence.path.length;
  const element = new BothForwardGlide((0.6 * length) as PathCoordinate, length as PathCoordinate);
  element.shortName = "G";
  sequence.addElement(element);
  const wrapper = mount(TimeSyncPane, { props: { sequences: [sequence], timeSeconds: 2.2, bpm: 120 } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const ce = chipByLabel(wrapper.find(".time-sync-pane").element, "CE");
  ce?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const emitted = wrapper.emitted("seek");
  expect(emitted?.length).toBe(1);
  // The inflection lies at half the path, so its chip time is half the span.
  expect(emitted?.[0]?.at(0)).toBeCloseTo(2);
  wrapper.unmount();
});

test("selects the CE chip while the cursor plays between its anchor and the next element", async () => {
  const sequence = buildSSequence();
  const length = sequence.path.length;
  const element = new BothForwardGlide((0.6 * length) as PathCoordinate, length as PathCoordinate);
  element.shortName = "G";
  sequence.addElement(element);
  const content = await openPane([sequence], 2.2);
  const current = elementChips(content).filter((chip) => !chip.classList.contains("time-sync-pane__chip--dim"));
  expect(current.length).toBe(1);
  expect(current[0]?.textContent?.trim()).toBe("CE");
});

test("shows no CE chip when an element span covers the inflection", async () => {
  const sequence = buildSSequence();
  const length = sequence.path.length;
  const element = new BothForwardGlide(0 as PathCoordinate, length as PathCoordinate);
  element.shortName = "G";
  sequence.addElement(element);
  const content = await openPane([sequence], 2.2);
  expect(elementChips(content).map((chip) => chip.textContent?.trim())).toEqual(["G"]);
});

test("shows one chip per crossed stroke with the crossed label prefix", async () => {
  const sequence = buildStraightSequence();
  const length = sequence.path.length;
  sequence.addElement(crossedStroke("LeftCrossedBackwardInsideGlide", 0, length / 2));
  sequence.addElement(crossedStroke("LeftCrossedBackBackwardInsideGlide", length / 2, length));
  const content = await openPane([sequence], 3);
  const labels = elementChips(content).map((chip) => chip.textContent?.trim());
  expect(labels).toEqual(["XF LBI", "XB LBI"]);
  // The chip of the running stroke is the current one.
  const current = elementChips(content).filter((chip) => !chip.classList.contains("time-sync-pane__chip--dim"));
  expect(current.length).toBe(1);
  expect(current[0]?.textContent?.trim()).toBe("XB LBI");
});

test("seeks to the stroke start when the crossed chip is clicked", async () => {
  const sequence = buildStraightSequence();
  const length = sequence.path.length;
  sequence.addElement(crossedStroke("LeftCrossedBackwardInsideGlide", 0, length / 2));
  const wrapper = mount(TimeSyncPane, { props: { sequences: [sequence], timeSeconds: 1, bpm: 120 } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const xf = chipByLabel(wrapper.find(".time-sync-pane").element, "XF LBI");
  xf?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(wrapper.emitted("seek")?.at(-1)?.at(0)).toBeCloseTo(0);
  wrapper.unmount();
});

test("shows an XS chip when a crossed stroke crosses a change of edge", async () => {
  const sequence = buildSSequence();
  const length = sequence.path.length;
  const stroke = crossedStroke("LeftCrossedForwardInsideGlide", 0.3 * length, 0.7 * length);
  stroke.shortName = "S";
  sequence.addElement(stroke);
  const content = await openPane([sequence], 2);
  const labels = elementChips(content).map((chip) => chip.textContent?.trim());
  // The stroke covers the inflection, so it carries the XS prefix and no CE
  // chip appears.
  expect(labels).toEqual(["XS S"]);
  const current = elementChips(content).filter((chip) => !chip.classList.contains("time-sync-pane__chip--dim"));
  expect(current[0]?.textContent?.trim()).toBe("XS S");
});

test("keeps a clickable chip for a crossed stroke that draws no pill", async () => {
  const sequence = buildStraightSequence();
  const length = sequence.path.length;
  sequence.addElement(crossedStroke("LeftCrossedForwardInsideGlide", 0, length / 2));
  const wrapper = mount(TimeSyncPane, { props: { sequences: [sequence], timeSeconds: 1, bpm: 120 } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const content = wrapper.find(".time-sync-pane").element;
  // The crossing letter pair replaces the plain short name on the chip.
  expect(elementChips(content).map((chip) => chip.textContent?.trim())).toEqual(["XF"]);
  const chip = chipByLabel(content, "XF");
  expect(chip?.getAttribute("title")).toBe("Crossed-front");
  chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(wrapper.emitted("seek")?.at(-1)?.at(0)).toBeCloseTo(0);
  wrapper.unmount();
});

test("keeps the pill alone for a crossed stroke without a short name", async () => {
  const sequence = buildStraightSequence();
  const length = sequence.path.length;
  const stroke = crossedStroke("LeftCrossedBackwardInsideGlide", 0, length / 2);
  stroke.shortName = "";
  sequence.addElement(stroke);
  const content = await openPane([sequence], 1);
  // The crossed stroke survives the empty short name with its pill.
  expect(elementChips(content).map((chip) => chip.textContent?.trim())).toEqual(["XF"]);
  expect(chipByLabel(content, "XF")?.getAttribute("title")).toBe("Crossed-front");
});

test("keeps only the markers whose anchor time plays inside the loop window", async () => {
  const sequence = buildSSequence();
  const length = sequence.path.length;
  const element = new BothForwardGlide((0.6 * length) as PathCoordinate, length as PathCoordinate);
  element.shortName = "G";
  sequence.addElement(element);
  // The CE chip plays at time 2, before the loop window.
  const outside = await openPane([sequence], 3.5, [3, 4]);
  expect(elementChips(outside).map((chip) => chip.textContent?.trim())).toEqual(["G"]);
  const inside = await openPane([sequence], 3.5, [1.5, 4]);
  expect(elementChips(inside).map((chip) => chip.textContent?.trim())).toEqual(["CE", "G"]);
});

test("shows only named elements, with only the current one at full opacity", async () => {
  const content = await openPane([buildFallbackSequence()], 4.5);
  const chips = elementChips(content);
  const labels = chips.map((chip) => chip.textContent?.trim());
  expect(labels).not.toContain("Two-feet forward glide");
  expect(labels).toContain("B");
  expect(labels).toContain("C");
  const current = chips.filter((chip) => !chip.classList.contains("time-sync-pane__chip--dim"));
  expect(current.length).toBe(1);
  expect(current[0]?.textContent?.trim()).toBe("B");
});

test("keeps only the elements that play inside the loop window", async () => {
  // Element B plays from time 3 to 6, element C from 6 to 9.
  const content = await openPane([buildFallbackSequence()], 4.5, [3, 5.9]);
  const labels = elementChips(content).map((chip) => chip.textContent?.trim());
  // The element after the loop end stays hidden.
  expect(labels).toEqual(["B"]);
  // The armed shape filters the same way: the span from A to the cursor.
  const armed = await openPane([buildFallbackSequence()], 4.5, [3, 4.5]);
  expect(elementChips(armed).map((chip) => chip.textContent?.trim())).toEqual(["B"]);
});

test("keeps an element that spans the loop start as the current chip", async () => {
  // Element B plays from time 3 to 6, so the loop start at 4.5 lies inside it.
  const content = await openPane([buildFallbackSequence()], 4.5, [4.5, 8]);
  const chips = elementChips(content);
  const labels = chips.map((chip) => chip.textContent?.trim());
  expect(labels).toEqual(["B", "C"]);
  const current = chips.filter((chip) => !chip.classList.contains("time-sync-pane__chip--dim"));
  expect(current.length).toBe(1);
  expect(current[0]?.textContent?.trim()).toBe("B");
});

test("seeks for the element at the center of the strip only when the scroll has settled", async () => {
  vi.useFakeTimers();
  try {
    const wrapper = mount(TimeSyncPane, {
      attachTo: document.body,
      props: { sequences: [buildFallbackSequence()], timeSeconds: 4.5, bpm: 120 },
    });
    await vi.advanceTimersByTimeAsync(0);
    const strip = document.body.querySelector<HTMLElement>(".time-sync-pane__strip");
    expect(strip).not.toBeNull();
    // Real input starts the gesture; the events of programmatic scrolls cannot.
    strip!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    strip!.dispatchEvent(new Event("scroll"));
    // No seek during the gesture: the time cursor updates only on settle.
    expect(wrapper.emitted("seek")).toBeUndefined();
    expect(wrapper.emitted("scrubStart")).toHaveLength(1);
    expect(wrapper.emitted("scrubEnd")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(250);
    // The center element of the strip is the first named element, B, at one third of the path.
    expect(wrapper.emitted("seek")?.at(-1)?.at(0)).toBeCloseTo(3);
    expect(wrapper.emitted("scrubStart")).toHaveLength(1);
    expect(wrapper.emitted("scrubEnd")).toHaveLength(1);
    wrapper.unmount();
  } finally {
    vi.useRealTimers();
  }
});

test("emits exactly one seek when a pill is clicked with multiple sequences present", async () => {
  const wrapper = mount(TimeSyncPane, {
    props: { sequences: [buildFallbackSequence(), buildFallbackSequence()], timeSeconds: 4.5, bpm: 120 },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const chips = elementChips(wrapper.find(".time-sync-pane").element);
  chips[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  // One click is the ground truth: exactly one seek, no reactions from the other strip.
  const emitted = wrapper.emitted("seek") ?? [];
  expect(emitted.length).toBe(1);
  expect(emitted[0]?.at(0)).toBeCloseTo(3);
  wrapper.unmount();
});

test("emits seek with the start time of the clicked element", async () => {
  const wrapper = mount(TimeSyncPane, {
    props: { sequences: [buildFallbackSequence()], timeSeconds: 4.5, bpm: 120 },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const chips = elementChips(wrapper.find(".time-sync-pane").element);
  const current = chips.find((chip) => !chip.classList.contains("time-sync-pane__chip--dim"));
  current?.dispatchEvent(new MouseEvent("click", { bubbles: true })); // click the current element
  await new Promise((resolve) => setTimeout(resolve, 0));
  const emitted = wrapper.emitted("seek");
  expect(emitted?.at(-1)?.at(0)).toBeCloseTo(3); // start of the second element, at one third of the path
  wrapper.unmount();
});

test("shows the French full name under the strip", async () => {
  const wrapper = mount(TimeSyncPane, {
    props: { sequences: [buildFallbackSequence()], timeSeconds: 4.5, bpm: 120 },
    global: { plugins: [createI18n({ legacy: false, locale: "fr", fallbackLocale: "en", messages: { en, fr } })] },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(wrapper.find(".time-sync-pane__strip-fullname").text()).toBe("Glissé avant deux pieds");
  wrapper.unmount();
});
