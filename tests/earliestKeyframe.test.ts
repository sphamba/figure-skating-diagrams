// @vitest-environment node
import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { PathCoordinate } from "../src/engine/coordinates";
import { earliestTimeKeyframeSeconds, Diagram } from "../src/engine/diagram";
import { TimingKeyframe } from "../src/engine/keyframe";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { Vector } from "../src/engine/vector";

function makeSequence(keyframes: TimingKeyframe[]): Sequence {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
  const sequence = new Sequence(path);
  sequence.keyframes.time = keyframes;
  return sequence;
}

function timeKeyframe(coordinate: number, value: number): TimingKeyframe {
  return new TimingKeyframe(coordinate as PathCoordinate, "time", value);
}

function beatsKeyframe(coordinate: number, value: number): TimingKeyframe {
  return new TimingKeyframe(coordinate as PathCoordinate, "beats", value);
}

test("earliest time keyframe is the minimum value across all sequences", () => {
  const diagram = new Diagram("d", [
    makeSequence([timeKeyframe(1.5, 3.75)]),
    makeSequence([timeKeyframe(1, 5), timeKeyframe(2, 2.25)]),
  ]);

  expect(earliestTimeKeyframeSeconds(diagram)).toBe(2.25);
});

test("beats keyframes are ignored", () => {
  const diagram = new Diagram("d", [makeSequence([timeKeyframe(1.5, 4), beatsKeyframe(0.5, 0.25)])]);

  expect(earliestTimeKeyframeSeconds(diagram)).toBe(4);
});

test("returns null when no time keyframes exist", () => {
  expect(earliestTimeKeyframeSeconds(new Diagram("d"))).toBeNull();
  expect(earliestTimeKeyframeSeconds(new Diagram("d", [makeSequence([beatsKeyframe(0.5, 1)])]))).toBeNull();
});
