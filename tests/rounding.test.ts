import { expect, test } from "vitest";
import { Annotation } from "@/engine/annotation";
import { Curve } from "@/engine/curve";
import { BothForwardGlide } from "@/engine/element/glide";
import { FootKeyframe, HipsKeyframe, TimingKeyframe } from "@/engine/keyframe";
import { Path } from "@/engine/path";
import { Sequence } from "@/engine/sequence";
import { getQuaternionFromAngleAxis } from "@/engine/quaternion";
import { PartialVector, Vector } from "@/engine/vector";
import type { PathCoordinate } from "@/engine/coordinates";

const rounded = (value: number) => Math.round(value * 1000) / 1000;

test("the curve constructor rounds long control point coordinates", () => {
  const curve = new Curve(
    new Vector(0.123456789, 0),
    new Vector(1.987654321, 0.5555555),
    new Vector(2.0000004, 0),
    new Vector(3.44449, -1.23456789),
  );
  expect(curve.p0.x).toBe(0.123);
  expect(curve.p1.x).toBe(1.988);
  expect(curve.p1.y).toBe(0.556);
  expect(curve.p2.x).toBe(2);
  expect(curve.p3.x).toBe(3.444);
  expect(curve.p3.y).toBe(-1.235);
});

test("the curve setter rounds and keeps the identity of already rounded vectors", () => {
  const curve = new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0));
  const shared = new Vector(0.5, 0.25);
  curve.p0 = shared;
  expect(curve.p0).toBe(shared);

  curve.p1 = new Vector(1.123456789, 0);
  expect(curve.p1.x).toBe(1.123);

  // A shared joint assigned through the setter keeps one object per curve.
  const joint = curve.p1;
  const other = new Curve(new Vector(9, 9), new Vector(9, 9), new Vector(9, 9), new Vector(9, 9));
  other.p0 = joint;
  expect(other.p0).toBe(joint);
});

test("element start and end round", () => {
  const element = new BothForwardGlide(0.123456789 as PathCoordinate, 0.987654321 as PathCoordinate);
  expect(element.start).toBe(0.123);
  expect(element.end).toBe(0.988);

  element.start = 1.23456789 as PathCoordinate;
  expect(element.start).toBe(1.235);
});

test("annotation start and end round", () => {
  const annotation = new Annotation(0.123456789 as PathCoordinate, 0.987654321 as PathCoordinate);
  expect(annotation.start).toBe(0.123);
  expect(annotation.end).toBe(0.988);

  annotation.start = 1.23456789 as PathCoordinate;
  expect(annotation.start).toBe(1.235);
});

test("foot keyframes round coordinate, position, contact point and spin shift", () => {
  const orientation = getQuaternionFromAngleAxis(Math.PI / 4);
  const keyframe = new FootKeyframe(0.123456789 as PathCoordinate, {
    position: new Vector<3>(1.1111111, 2.2222222, 3.3333333),
    orientation,
    contactPoint: 0.123456789,
    toePick: true,
    spins: 3,
    spinShift: 0.987654321,
  });
  expect(keyframe.coordinate).toBe(0.123);
  expect((keyframe.data.position as Vector<3>).data).toEqual([1.111, 2.222, 3.333]);
  expect(keyframe.data.orientation).toBe(orientation);
  expect(keyframe.data.contactPoint).toBe(0.123);
  expect(keyframe.data.toePick).toBe(true);
  expect(keyframe.data.spins).toBe(3);
  expect(keyframe.data.spinShift).toBe(0.988);

  const partial = new FootKeyframe(1.1111111 as PathCoordinate, {
    position: new PartialVector<3>(0.123456789, undefined, 0.987654321),
  });
  expect(partial.coordinate).toBe(1.111);
  expect((partial.data.position as PartialVector<3>).data).toEqual([0.123, undefined, 0.988]);
});

test("hips keyframes round coordinate and position", () => {
  const keyframe = new HipsKeyframe(0.123456789 as PathCoordinate, {
    position: new Vector<3>(1.1111111, 2.2222222, 3.3333333),
  });
  expect(keyframe.coordinate).toBe(0.123);
  expect((keyframe.data.position as Vector<3>).data).toEqual([1.111, 2.222, 3.333]);
});

test("timing keyframes round path coordinate and value", () => {
  const keyframe = new TimingKeyframe(0.123456789 as PathCoordinate, "time", 2.987654321);
  expect(keyframe.pathCoordinate).toBe(0.123);
  expect(keyframe.value).toBe(2.988);
  expect(keyframe.coordinate).toBe(0.123);
});

// saveToStorage and the json export both serialize toJSON, so this covers the
// stored and exported numbers.
test("the stored and exported json carries at most 3 decimal places", () => {
  const json = {
    path: {
      curves: [{ points: [0.123456789, 0.987654321, 1.1111111, 0, 2.2222222, 0, 3.3333333, 0] }],
    },
    keyframes: {
      footL: [],
      footR: [],
      hips: [],
      time: [
        {
          kind: "TimingKeyframe",
          coordinate: 4.44444444,
          data: { type: "time", value: 5.55555555 },
          transitionIn: "linear",
          transitionOut: "linear",
        },
      ],
    },
    elements: [{ type: "BothForwardGlide", start: 0.111111111, end: 0.999999999 }],
    annotations: [{ start: 0.123456789, end: 0.987654321, title: "A", description: "", color: "#ffff00" }],
  };
  const sequence = Sequence.fromJSON(json as never);
  const output = JSON.stringify(sequence.toJSON());
  expect(output).not.toMatch(/\d+\.\d{4,}/);
});

test("path translate and mirror round the transformed control points", () => {
  const path = new Path();
  path.curves.push(new Curve(new Vector(0.123456789, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0)));
  path.curves.push(new Curve(new Vector(3, 0), new Vector(4, 0), new Vector(5, 0), new Vector(6, 0.123456789)));
  path.curves[1]!.p0 = path.curves[0]!.p3;

  path.translate(new Vector(0.0000004, 0));
  for (const curve of path.curves) {
    for (const point of [curve.p0, curve.p1, curve.p2, curve.p3]) {
      expect(point.x).toBe(rounded(point.x));
      expect(point.y).toBe(rounded(point.y));
    }
  }

  path.mirrorHorizontal();
  for (const curve of path.curves) {
    for (const point of [curve.p0, curve.p1, curve.p2, curve.p3]) {
      expect(point.x).toBe(rounded(point.x));
      expect(point.y).toBe(rounded(point.y));
    }
  }
  // A shared joint stays one object after the mirror.
  expect(path.curves[0]!.p3).toBe(path.curves[1]!.p0);
});
