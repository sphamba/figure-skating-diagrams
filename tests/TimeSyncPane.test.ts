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

test("shows the annotation with its sequence name next to it while the cursor is within the sequence", async () => {
  const content = await openPane([buildSequence()], 3.9);
  expect(content).not.toBeNull();
  const text = content?.textContent ?? "";
  expect(text).toContain("Annotation");
  expect(text).toContain("Sequence");
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

test("shows the labeled element whose end time is closest when not inside a labeled element", async () => {
  const content = await openPane([buildFallbackSequence()], 1);
  const text = content?.textContent ?? "";
  expect(text).toContain("B");
  expect(text).not.toContain("C");
});
