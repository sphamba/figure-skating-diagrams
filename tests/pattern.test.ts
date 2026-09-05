import { expect, test } from "vitest";
import type { PathCoordinate, Time } from "../src/engine/coordinates";
import { Curve } from "../src/engine/curve";
import { TimeKeyframe } from "../src/engine/keyframe";
import { Path } from "../src/engine/path";
import { Pattern } from "../src/engine/pattern";
import { Sequence } from "../src/engine/sequence";
import { Vector } from "../src/engine/vector";

function makeStraightLengthOnePath(): Path {
  const p0 = new Vector(0, 0);
  const p1 = new Vector(1 / 3, 0);
  const p2 = new Vector(2 / 3, 0);
  const p3 = new Vector(1, 0);

  const path = new Path();
  path.addCurveEnd(new Curve(p0, p1, p2, p3));
  return path;
}

test("Pattern stores name, videoUrl and sequences", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  const pattern = new Pattern("Three turn", [sequence], "https://example.com/video.mp4");

  expect(pattern.name).toBe("Three turn");
  expect(pattern.videoUrl).toBe("https://example.com/video.mp4");
  expect(pattern.sequences).toEqual([sequence]);
});

test("Pattern videoUrl is optional", () => {
  const pattern = new Pattern("Mohawk");
  expect(pattern.videoUrl).toBeUndefined();
  expect(pattern.sequences).toEqual([]);
});

test("Pattern can add sequences", () => {
  const pattern = new Pattern("Mohawk");
  const sequence = new Sequence(makeStraightLengthOnePath());
  sequence.addKeyframe("time", new TimeKeyframe(2 as Time, { pathCoordinate: 1 as PathCoordinate }));

  pattern.addSequence(sequence);
  expect(pattern.sequences).toHaveLength(1);
  expect(pattern.sequences[0]).toBe(sequence);
});
