// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import { FootKeyframe, HipsKeyframe } from "../src/engine/keyframe.js";
import { Path } from "../src/engine/path.js";
import { getQuaternionFromAngleAxis } from "../src/engine/quaternion.js";
import { Sequence } from "../src/engine/sequence.js";
import { PartialVector, Vector } from "../src/engine/vector.js";

type FilteredVariant = {
  getInterpolatedValueInFilteredList: (
    property: string,
    coordinate: number,
    filtered: FootKeyframe[],
    fallback?: FootKeyframe[],
  ) => unknown;
};

// footL: the keyframe at 0 sets only position (and toePick); the keyframes at 2
// and 4 set position, orientation and contactPoint. Hips: the keyframe at 0
// sets only position; the keyframes at 2 and 4 set both attributes.
function makeSequence(): Sequence {
  const sequence = new Sequence(new Path());
  sequence.keyframes.footL.push(
    new FootKeyframe(0 as PathCoordinate, {
      position: new Vector<3>(0, 0, 0),
      toePick: false,
    }),
    new FootKeyframe(2 as PathCoordinate, {
      position: new Vector<3>(2, 2, 0),
      orientation: getQuaternionFromAngleAxis(Math.PI / 2),
      contactPoint: 1,
      toePick: false,
    }),
    new FootKeyframe(4 as PathCoordinate, {
      position: new Vector<3>(4, 4, 0),
      orientation: getQuaternionFromAngleAxis(Math.PI),
      contactPoint: 0,
      toePick: false,
    }),
  );
  sequence.keyframes.hips.push(
    new HipsKeyframe(0 as PathCoordinate, { position: new Vector<3>(0, 0, 0) }),
    new HipsKeyframe(2 as PathCoordinate, {
      position: new Vector<3>(2, 2, 0),
      orientation: getQuaternionFromAngleAxis(Math.PI / 2),
    }),
    new HipsKeyframe(4 as PathCoordinate, {
      position: new Vector<3>(4, 4, 0),
      orientation: getQuaternionFromAngleAxis(Math.PI),
    }),
  );
  return sequence;
}

function filteredVariant(sequence: Sequence): FilteredVariant {
  return sequence as unknown as FilteredVariant;
}

describe("interpolation of a quantity skips keyframes that don't define it", () => {
  test("foot position interpolates through the partial keyframe", () => {
    const sequence = makeSequence();
    const value = sequence.getInterpolatedValue("footL", "position", 1 as PathCoordinate) as Vector<3>;
    expect(value.x).toBeCloseTo(1, 10);
    expect(value.y).toBeCloseTo(1, 10);
  });

  test("foot orientation holds the next defining keyframe", () => {
    const sequence = makeSequence();
    const value = sequence.getInterpolatedValue("footL", "orientation", 1 as PathCoordinate);
    expect(value.real).toBeCloseTo(getQuaternionFromAngleAxis(Math.PI / 2).real, 10);
  });

  test("foot contactPoint holds the next defining keyframe", () => {
    const sequence = makeSequence();
    const value = sequence.getInterpolatedValue("footL", "contactPoint", 1 as PathCoordinate) as number;
    expect(value).toBeCloseTo(1, 10);
  });

  test("hips position interpolates through the partial keyframe", () => {
    const sequence = makeSequence();
    const value = sequence.getInterpolatedValue("hips", "position", 1 as PathCoordinate) as Vector<3>;
    expect(value.x).toBeCloseTo(1, 10);
  });

  test("hips orientation holds the next defining keyframe", () => {
    const sequence = makeSequence();
    const value = sequence.getInterpolatedValue("hips", "orientation", 1 as PathCoordinate);
    expect(value.real).toBeCloseTo(getQuaternionFromAngleAxis(Math.PI / 2).real, 10);
  });
});

describe("trace-drawing per-property filtered interpolation", () => {
  const propertyFilters = {
    position: (keyframe: FootKeyframe) => keyframe.data.position !== undefined,
    orientation: (keyframe: FootKeyframe) => keyframe.data.orientation !== undefined,
    contactPoint: (keyframe: FootKeyframe) => keyframe.data.contactPoint !== undefined,
  } as const;

  test("position uses the partial keyframe", () => {
    const sequence = makeSequence();
    const filtered = sequence.keyframes.footL.filter(propertyFilters.position);
    expect(filtered).toHaveLength(3);
    const value = filteredVariant(sequence).getInterpolatedValueInFilteredList("position", 1, filtered) as Vector<3>;
    expect(value.x).toBeCloseTo(1, 10);
  });

  test("orientation skips the partial keyframe", () => {
    const sequence = makeSequence();
    const filtered = sequence.keyframes.footL.filter(propertyFilters.orientation);
    expect(filtered).toHaveLength(2);
    const value = filteredVariant(sequence).getInterpolatedValueInFilteredList("orientation", 1, filtered) as unknown;
    expect((value as { real: number }).real).toBeCloseTo(getQuaternionFromAngleAxis(Math.PI / 2).real, 10);
  });

  test("contactPoint skips the partial keyframe", () => {
    const sequence = makeSequence();
    const filtered = sequence.keyframes.footL.filter(propertyFilters.contactPoint);
    expect(filtered).toHaveLength(2);
    const value = filteredVariant(sequence).getInterpolatedValueInFilteredList("contactPoint", 1, filtered) as number;
    expect(value).toBeCloseTo(1, 10);
  });
});

describe("no keyframe defines the quantity", () => {
  function makeOrientationless(): Sequence {
    const sequence = makeSequence();
    sequence.keyframes.footL = sequence.keyframes.footL.map(
      (keyframe) => new FootKeyframe(keyframe.coordinate, { position: keyframe.data.position, toePick: false }),
    );
    return sequence;
  }

  function makePositionless(): Sequence {
    const sequence = makeSequence();
    sequence.keyframes.footL = sequence.keyframes.footL.map(
      (keyframe) => new FootKeyframe(keyframe.coordinate, { toePick: false }),
    );
    return sequence;
  }

  test("getInterpolatedValue reports the missing property", () => {
    expect(() => makeOrientationless().getInterpolatedValue("footL", "orientation", 1 as PathCoordinate)).toThrow(
      "No keyframe data for property: orientation",
    );
  });

  test("a coordinate no keyframe defines contributes 0", () => {
    const value = makePositionless().getInterpolatedValue("footL", "position", 1 as PathCoordinate) as Vector<3>;
    expect(value.x).toBe(0);
    expect(value.y).toBe(0);
    expect(value.z).toBe(0);
  });

  test("the trace-drawing variant returns undefined without a fallback list", () => {
    const orientationless = makeOrientationless();
    const filtered = orientationless.keyframes.footL.filter((keyframe) => keyframe.data.orientation !== undefined);
    expect(filtered).toHaveLength(0);
    const value = filteredVariant(orientationless).getInterpolatedValueInFilteredList(
      "orientation",
      1,
      filtered,
    ) as unknown;
    expect(value).toBeUndefined();
  });
});

describe("partial position coordinates", () => {
  // footL: the keyframe at 0 sets only x, the keyframe at 2 sets everything,
  // the keyframe at 4 sets only z.
  function makePartialCoordinates(): Sequence {
    const sequence = new Sequence(new Path());
    sequence.keyframes.footL.push(
      new FootKeyframe(0 as PathCoordinate, { position: PartialVector.fromXYZ({ x: 1 }), toePick: false }),
      new FootKeyframe(2 as PathCoordinate, {
        position: new Vector<3>(2, 2, 2),
        orientation: getQuaternionFromAngleAxis(Math.PI / 2),
        contactPoint: 1,
        toePick: false,
      }),
      new FootKeyframe(4 as PathCoordinate, { position: PartialVector.fromXYZ({ z: 4 }), toePick: false }),
    );
    return sequence;
  }

  test("each coordinate interpolates only over the keyframes that define it", () => {
    const sequence = makePartialCoordinates();
    const value = sequence.getInterpolatedValue("footL", "position", 1 as PathCoordinate) as Vector<3>;
    // x is defined at 0 and 2 and interpolates between them.
    expect(value.x).toBeCloseTo(1.5, 10);
    // y is only defined at 2, so it holds the next defining keyframe.
    expect(value.y).toBeCloseTo(2, 10);
    // z is defined at 2 and 4, and u = 1 is before the first.
    expect(value.z).toBeCloseTo(2, 10);
  });

  test("a coordinate holds its last defining keyframe past it", () => {
    const sequence = makePartialCoordinates();
    const value = sequence.getInterpolatedValue("footL", "position", 3 as PathCoordinate) as Vector<3>;
    expect(value.x).toBeCloseTo(2, 10);
    expect(value.y).toBeCloseTo(2, 10);
    // z is defined at 2 and 4 and interpolates between them.
    expect(value.z).toBeCloseTo(3, 10);
  });

  test("hips keyframes interpolate the coordinates the same way", () => {
    const sequence = new Sequence(new Path());
    sequence.keyframes.hips.push(
      new HipsKeyframe(0 as PathCoordinate, { position: PartialVector.fromXYZ({ y: 4 }) }),
      new HipsKeyframe(2 as PathCoordinate, { position: new Vector<3>(0, 4, 0) }),
    );
    const value = sequence.getInterpolatedValue("hips", "position", 1 as PathCoordinate) as Vector<3>;
    expect(value.x).toBe(0);
    expect(value.y).toBeCloseTo(4, 10);
    expect(value.z).toBe(0);
  });
});

describe("partial keyframes survive JSON", () => {
  test("a spins-only keyframe keeps spins and spinShift", () => {
    const keyframe = new FootKeyframe(1.5 as PathCoordinate, { spins: 3, spinShift: 0.015 });
    const restored = FootKeyframe.fromJSON(keyframe.toJSON());
    expect(restored.data.spins).toBe(3);
    expect(restored.data.spinShift).toBeCloseTo(0.015, 10);
    expect(restored.data.position).toBeUndefined();
    expect(restored.data.orientation).toBeUndefined();
  });

  test("a position-only keyframe keeps orientation unset", () => {
    const keyframe = new FootKeyframe(0 as PathCoordinate, {
      position: new Vector<3>(1, 2, 0),
      toePick: true,
    });
    const restored = FootKeyframe.fromJSON(keyframe.toJSON());
    expect((restored.data.position as Vector<3>).x).toBe(1);
    expect(restored.data.orientation).toBeUndefined();
    expect(restored.data.toePick).toBe(true);
    expect(restored.data.contactPoint).toBeUndefined();
  });

  test("a hips keyframe with only orientation keeps position unset", () => {
    const keyframe = new HipsKeyframe(1 as PathCoordinate, {
      orientation: getQuaternionFromAngleAxis(Math.PI),
    });
    const restored = HipsKeyframe.fromJSON(keyframe.toJSON());
    expect(restored.data.orientation!.real).toBeCloseTo(keyframe.data.orientation!.real, 10);
    expect(restored.data.position).toBeUndefined();
  });

  test("a partial position round-trips with unset coordinates", () => {
    const keyframe = new FootKeyframe(0 as PathCoordinate, {
      position: PartialVector.fromXYZ({ y: 2 }),
      toePick: false,
    });
    expect(keyframe.toJSON().data.position!.data).toEqual([null, 2, null]);
    const restored = FootKeyframe.fromJSON(keyframe.toJSON());
    expect(restored.data.position).toBeInstanceOf(PartialVector);
    const position = restored.data.position as PartialVector<3>;
    expect(position.get(0)).toBeUndefined();
    expect(position.get(1)).toBe(2);
    expect(position.get(2)).toBeUndefined();
  });

  test("a complete position parses to a Vector", () => {
    const keyframe = new HipsKeyframe(1 as PathCoordinate, { position: new Vector<3>(1, 0, 3) });
    const restored = HipsKeyframe.fromJSON(keyframe.toJSON());
    expect(restored.data.position).toBeInstanceOf(Vector);
    expect(restored.data.position!.toJSON().data).toEqual([1, 0, 3]);
  });
});
