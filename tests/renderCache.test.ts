import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import { Curve } from "../src/engine/curve.js";
import { Path } from "../src/engine/path.js";
import { Sequence } from "../src/engine/sequence.js";
import { LeftForwardInsideGlide } from "../src/engine/element/glide.js";
import { LeftForwardInsideThreeTurn } from "../src/engine/element/threeTurn.js";
import { FootKeyframe } from "../src/engine/keyframe.js";
import { Quaternion } from "../src/engine/quaternion.js";
import { Vector } from "../src/engine/vector.js";

function makeMockContext() {
  const strokes: unknown[] = [];
  const ctx: Record<string, unknown> = {
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => strokes.push("stroke"),
    setLineDash: () => {},
  };
  return { ctx, strokes };
}

function makePath(): Path {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
  return path;
}

function makeStraightCurve(): Curve {
  return new Curve(new Vector(0, -1), new Vector(1 / 3, -1), new Vector(2 / 3, 0.5), new Vector(1, 1));
}


function makeSequenceWithTrace(): Sequence {
  const sequence = new Sequence(makePath());
  const orientation = new Quaternion(1, new Vector<3>(0, 0, 0));
  const position = new Vector<3>(0, 0, 0);
  sequence.addKeyframe(
    "footL",
    new FootKeyframe(0 as PathCoordinate, { position: position.copy(), orientation: orientation.copy(), contactPoint: 0.5 }),
  );
  sequence.addKeyframe(
    "footL",
    new FootKeyframe(1 as PathCoordinate, { position: position.copy(), orientation: orientation.copy(), contactPoint: 0.5 }),
  );
  return sequence;
}

type TraceCacheAccessor = {
  getTraceSegments(footKey: "footL", bladeLength: number, step: number, drawable: unknown): Float64Array;
};

test("the trace segment cache holds between draws and rebuilds after element removal", () => {
  const sequence = makeSequenceWithTrace();
  sequence.addElement(new LeftForwardInsideGlide(0.3 as PathCoordinate, 0.7 as PathCoordinate));
  const accessor = sequence as unknown as TraceCacheAccessor;
  const drawable = sequence.keyframes.footL;
  const first = accessor.getTraceSegments("footL", 0.25, 0.02, drawable);
  expect(accessor.getTraceSegments("footL", 0.25, 0.02, drawable)).toBe(first);

  sequence.removeElement(sequence.elements[0]!);
  expect(accessor.getTraceSegments("footL", 0.25, 0.02, drawable)).not.toBe(first);
});

test("skipTraceCache rebuilds the visible range without touching the cache", () => {
  const sequence = makeSequenceWithTrace();
  const mock = makeMockContext();
  sequence.drawFootTrace(mock.ctx as never, "footL", 0 as PathCoordinate, undefined, undefined, undefined, undefined, undefined, undefined, true);
  const accessor = sequence as unknown as { traceCache: Map<string, unknown> };
  const before = accessor.traceCache.get("footL");
  expect(before).toBeUndefined();

  const runner = sequence as unknown as {
    drawFootTrace(
      ctx: unknown,
      footKey: "footL",
      uStart: PathCoordinate,
      uEnd?: PathCoordinate,
      ...rest: unknown[]
    ): void;
  };
  const cacheAccess = sequence as unknown as TraceCacheAccessor;
  const cached = cacheAccess.getTraceSegments("footL", 0.25, 0.02, sequence.keyframes.footL);
  runner.drawFootTrace(mock.ctx as never, "footL", 0 as PathCoordinate, undefined, undefined, undefined, undefined, undefined, undefined, true);
  expect(cacheAccess.getTraceSegments("footL", 0.25, 0.02, sequence.keyframes.footL)).toBe(cached);
});

test("nearby zoom levels share one trace segment cache entry", () => {
  const sequence = makeSequenceWithTrace();
  const accessor = sequence as unknown as TraceCacheAccessor;
  const drawable = sequence.keyframes.footL;
  const first = accessor.getTraceSegments("footL", 0.25, 0.02, drawable);
  expect(accessor.getTraceSegments("footL", 0.25, 0.0201, drawable)).toBe(first);
  expect(accessor.getTraceSegments("footL", 0.25, 0.04, drawable)).not.toBe(first);
});

test("getDrawFootKeyframes drops a removed element after removeElement", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideGlide(0.1 as PathCoordinate, 0.4 as PathCoordinate));
  const removed = new LeftForwardInsideThreeTurn("footL", 0.5 as PathCoordinate, 0.9 as PathCoordinate);
  sequence.addElement(removed);

  const before = sequence.getDrawFootKeyframes("footL", 2);
  expect(before.some((keyframe) => keyframe.coordinate > 0.49 && keyframe.coordinate < 0.91)).toBe(true);

  sequence.removeElement(removed);

  const after = sequence.getDrawFootKeyframes("footL", 2);
  expect(after.some((keyframe) => keyframe.coordinate > 0.49 && keyframe.coordinate < 0.91)).toBe(false);
});

test("getDrawFootKeyframes recomputes after the scale or the length change", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.3 as PathCoordinate, 0.7 as PathCoordinate));
  sequence.getDrawFootKeyframes("footL", 2);
  const first = sequence.getDrawFootKeyframes("footL", 2);
  expect(first.length).toBeGreaterThan(0);

  sequence.path.updateLength();
  const afterLength = sequence.getDrawFootKeyframes("footL", 2);
  expect(afterLength.length).toBeGreaterThan(0);
});

test("resolveTimes recomputes after invalidateTimeCaches", () => {
  const sequence = new Sequence(makePath());
  const first = sequence.resolveTimes(120);
  expect(first).toBe(sequence.resolveTimes(120));

  const anotherBpm = sequence.resolveTimes(60);
  expect(anotherBpm.map((entry) => entry.time)).toEqual([0]);

  sequence.invalidateTimeCaches();
  expect(sequence.resolveTimes(120)).not.toBe(first);
});

test("getCurvilinearCoordFromUniform matches a linear scan on a curved sample set", () => {
  const curve = makeStraightCurve();
  const coordinates = curve.uniformCoordinates;
  for (let i = 0; i <= 200; i++) {
    const u = (i / 200) * curve.length;
    const binary = curve.getCurvilinearCoordFromUniform(u);
    if (u >= curve.length) {
      expect(binary).toBe(1);
      continue;
    }
    const originalUpper = coordinates.findIndex((x: number) => x > u);
    const original =
      originalUpper <= 0
        ? 0
        : (((u - coordinates[originalUpper - 1]!) / (coordinates[originalUpper]! - coordinates[originalUpper - 1]!)) *
            (Math.min(originalUpper * 0.001, 1) -
              Math.min((originalUpper - 1) * 0.001, 1)) +
            (originalUpper - 1) * 0.001) as number;
    expect(binary as number).toBeCloseTo(original, 6);
  }
  expect(curve.getCurvilinearCoordFromUniform(curve.length)).toBe(1);
});

function makeRecordingContext() {
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const ctx: Record<string, unknown> = {
    globalAlpha: 1,
    beginPath: () => {},
    moveTo: (x: number, y: number) => { (ctx as Record<string, unknown>)._from = [x, y]; },
    lineTo: (x: number, y: number) => {
      const from = (ctx as Record<string, unknown>)._from as [number, number] | undefined;
      if (from) lines.push({ x1: from[0], y1: from[1], x2: x, y2: y });
      (ctx as Record<string, unknown>)._from = [x, y];
    },
    stroke: () => {},
    setLineDash: () => {},
  };
  return { ctx, lines };
}

test("replayed trace segments keep the canvas y-negation of the direct draw", () => {
  const sequence = new Sequence(makePath());
  const orientation = new Quaternion(1, new Vector<3>(0, 0, 0));
  const offset = new Vector<3>(0, 1, 0);
  for (const u of [0, 1]) {
    sequence.addKeyframe(
      "footL",
      new FootKeyframe(u as PathCoordinate, { position: offset.copy(), orientation: orientation.copy(), contactPoint: 0.5 }),
    );
  }

  // The cached replay must draw at -path-y, like the old direct stroke did.
  const mock = makeRecordingContext();
  sequence.drawFootTrace(mock.ctx as never, "footL", 0 as PathCoordinate, undefined);
  expect(mock.lines.length).toBeGreaterThan(0);
  for (const line of mock.lines) {
    // Canvas y is the negated path y, so a contact at path y = +1 draws at -1.
    expect(line.y1).toBeLessThan(0);
    expect(line.y2).toBeLessThan(0);
  }
});
