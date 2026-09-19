// @vitest-environment node
import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import { HipsKeyframe, type Transition } from "../src/engine/keyframe.js";
import { Path } from "../src/engine/path.js";
import { getQuaternionFromAngleAxis } from "../src/engine/quaternion.js";
import { Sequence } from "../src/engine/sequence.js";
import { Vector } from "../src/engine/vector.js";

const length = 10;

function makeKeyframes(transitionOut: Transition, transitionIn: Transition): HipsKeyframe[] {
  const data = { position: new Vector<3>(0, 0, 0), orientation: getQuaternionFromAngleAxis(0) };
  const endData = { position: new Vector<3>(10, 0, 0), orientation: getQuaternionFromAngleAxis(0) };
  return [
    new HipsKeyframe(0 as PathCoordinate, data, "smooth", transitionOut),
    new HipsKeyframe(length as PathCoordinate, endData, transitionIn, "smooth"),
  ];
}

function makeSequence(): Sequence {
  const sequence = new Sequence(new Path());
  return sequence;
}

function interpolatePosition(transitionOut: Transition, transitionIn: Transition): number {
  const sequence = makeSequence();
  sequence.keyframes.hips.push(...makeKeyframes(transitionOut, transitionIn));
  const quarter = (length / 4) as PathCoordinate;
  return (sequence.getInterpolatedValue("hips", "position", quarter) as Vector<3>).x;
}

test.each([
  [["smooth", "smooth"], 1.5625],
  [["smooth", "linear"], 0.625],
  [["linear", "smooth"], 4.375],
  [["linear", "linear"], 2.5],
] as [[Transition, Transition], number][])("getInterpolatedValue eases %s transitions", ([out, inTransition], expected) => {
  expect(interpolatePosition(out, inTransition)).toBeCloseTo(expected, 10);
});

// getEasedTime is shared with the trace-drawing variant, so the same cases
// guard the per-sample filtered-list interpolation used to draw foot traces.
test.each([
  [["smooth", "smooth"], 1.5625],
  [["smooth", "linear"], 0.625],
  [["linear", "smooth"], 4.375],
  [["linear", "linear"], 2.5],
] as [[Transition, Transition], number][])( "getInterpolatedValueInFilteredList eases %s transitions", ([out, inTransition], expected) => {
  const sequence = makeSequence();
  sequence.keyframes.hips.push(...makeKeyframes(out, inTransition));
  const filtered = sequence.keyframes.hips.filter((keyframe) => keyframe.data.position !== undefined);
  const variant = (
    sequence as unknown as {
      getInterpolatedValueInFilteredList: (property: string, coordinate: number, filtered: HipsKeyframe[]) => unknown;
    }
  ).getInterpolatedValueInFilteredList("position", length / 4, filtered) as Vector<3>;
  expect(variant.x).toBeCloseTo(expected, 10);
});
