import { expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import TimeSyncPane from "@/components/TimeSyncPane.vue";
import { BothForwardGlide } from "@/engine/element/glide";
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

async function openPane(sequences: Sequence[], time: number | null): Promise<HTMLElement | null> {
  const wrapper = mount(TimeSyncPane, { props: { sequences, timeSeconds: time, bpm: 120 } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const content = document.body.querySelector(".p-drawer-content");
  wrapper.unmount();
  return content;
}

test("shows the annotation title with its detail below while the cursor is within the sequence", async () => {
  const content = await openPane([buildSequence()], 3.9);
  expect(content).not.toBeNull();
  const text = content?.textContent ?? "";
  expect(text).toContain("Annotation");
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

test("hides the inline annotation description while the row is unfolded", async () => {
  const wrapper = mount(TimeSyncPane, {
    props: { sequences: [buildSequence()], timeSeconds: 3.9, bpm: 120 },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const header = document.body.querySelector(".p-accordionheader");
  const summary = document.body.querySelector(".time-sync-pane__summary");
  expect(summary).not.toBeNull();
  expect(summary?.textContent).toContain("No description");
  header?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.body.querySelector(".time-sync-pane__summary--hidden")).not.toBeNull();
  wrapper.unmount();
});

function elementChips(root: HTMLElement | null): HTMLButtonElement[] {
  return Array.from(root?.querySelectorAll("button.time-sync-pane__chip--element") ?? []);
}

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

test("seeks for the element at the center of the strip only when the scroll has settled", async () => {
  const wrapper = mount(TimeSyncPane, {
    props: { sequences: [buildFallbackSequence()], timeSeconds: 4.5, bpm: 120 },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const strip = document.body.querySelector<HTMLElement>(".time-sync-pane__strip");
  expect(strip).not.toBeNull();
  strip!.dispatchEvent(new Event("scroll"));
  // No seek during the gesture: the time cursor updates only on settle.
  expect(wrapper.emitted("seek")).toBeUndefined();
  expect(wrapper.emitted("scrubStart")).toHaveLength(1);
  expect(wrapper.emitted("scrubEnd")).toBeUndefined();
  await new Promise((resolve) => setTimeout(resolve, 250));
  // The center element of the strip is the first named element, B, at one third of the path.
  expect(wrapper.emitted("seek")?.at(-1)?.at(0)).toBeCloseTo(3);
  expect(wrapper.emitted("scrubStart")).toHaveLength(1);
  expect(wrapper.emitted("scrubEnd")).toHaveLength(1);
  wrapper.unmount();
});

test("emits exactly one seek when a pill is clicked with multiple sequences present", async () => {
  const wrapper = mount(TimeSyncPane, {
    props: { sequences: [buildFallbackSequence(), buildFallbackSequence()], timeSeconds: 4.5, bpm: 120 },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const chips = elementChips(document.body.querySelector(".p-drawer-content"));
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
  const chips = elementChips(document.body.querySelector(".p-drawer-content"));
  const current = chips.find((chip) => !chip.classList.contains("time-sync-pane__chip--dim"));
  current?.dispatchEvent(new MouseEvent("click", { bubbles: true })); // click the current element
  await new Promise((resolve) => setTimeout(resolve, 0));
  const emitted = wrapper.emitted("seek");
  expect(emitted?.at(-1)?.at(0)).toBeCloseTo(3); // start of the second element, at one third of the path
  wrapper.unmount();
});
