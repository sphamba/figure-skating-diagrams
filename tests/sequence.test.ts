import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { PathCoordinate, Time } from "../src/engine/coordinates";
import { FootKeyframe, TimingKeyframe } from "../src/engine/keyframe";
import { Path } from "../src/engine/path";
import { Quaternion } from "../src/engine/quaternion";
import { LeftForwardOutsideThreeTurn } from "../src/engine/element/threeTurn";
import { LeftForwardOutsideLoop } from "../src/engine/element/loop";
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

test("Clock maps path coordinate to time and back", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  sequence.addKeyframe("time", new TimingKeyframe(1 as PathCoordinate, "time", 2));

  expect(sequence.getPathCoordinateFromTime(1 as Time)).toBeCloseTo(0.5);
  expect(sequence.getTimeFromPathCoordinate(0.5 as PathCoordinate)).toBeCloseTo(1);
});

test("Clock inverse and forward mapping are consistent", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  sequence.addKeyframe("time", new TimingKeyframe(1 as PathCoordinate, "time", 2));

  for (const t of [0.1, 0.4, 0.75, 1.3, 1.9]) {
    const u = sequence.getPathCoordinateFromTime(t as Time);
    expect(sequence.getTimeFromPathCoordinate(u)).toBeCloseTo(t);
  }
});

test("Clock clamps outside the defined range", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  sequence.addKeyframe("time", new TimingKeyframe(1 as PathCoordinate, "time", 2));

  expect(sequence.getTimeFromPathCoordinate((-0.5) as PathCoordinate)).toBeCloseTo(0);
  expect(sequence.getTimeFromPathCoordinate(5 as PathCoordinate)).toBeCloseTo(2);
  expect(sequence.getPathCoordinateFromTime((-0.3) as Time)).toBeCloseTo(0);
  expect(sequence.getPathCoordinateFromTime(3 as Time)).toBeCloseTo(1);
});

test("Beats resolve from the previous timing keyframe", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  sequence.addKeyframe("time", new TimingKeyframe(1 as PathCoordinate, "beats", 2));

  expect(sequence.getDuration(120)).toBeCloseTo(1);
  expect(sequence.getPathCoordinateFromTime(0.5 as Time)).toBeCloseTo(0.5);
});

const TRACE_COLOR_L = "#3030d2";
const TRACE_COLOR_R = "#9c0000";

function makeMockContext() {
  const strokes: unknown[] = [];
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let from: [number, number] | null = null;
  const ctx: Record<string, unknown> = {
    strokeStyle: undefined,
    lineWidth: 0,
    beginPath: () => {
      from = null;
    },
    moveTo: (x: number, y: number) => {
      from = [x, y];
    },
    lineTo: (x: number, y: number) => {
      if (from) lines.push({ x1: from[0], y1: from[1], x2: x, y2: y });
      from = [x, y];
    },
    bezierCurveTo: () => {},
    stroke: () => strokes.push(ctx.strokeStyle),
  };
  return { ctx, strokes, lines };
}

function makeSequenceWithBothFeet(): Sequence {
  const sequence = new Sequence(makeStraightLengthOnePath());
  const orientation = new Quaternion(1, new Vector<3>(0, 0, 0));
  const position = new Vector<3>(0, 0, 0);
  for (const foot of ["footL", "footR"] as const) {
    sequence.addKeyframe(
      foot,
      new FootKeyframe(0 as PathCoordinate, {
        position: position.copy(),
        orientation: orientation.copy(),
        contactPoint: 0.5,
      }),
    );
    sequence.addKeyframe(
      foot,
      new FootKeyframe(1 as PathCoordinate, {
        position: position.copy(),
        orientation: orientation.copy(),
        contactPoint: 0.5,
      }),
    );
  }
  return sequence;
}

test("draw renders traces for both feet", () => {
  const { ctx, strokes } = makeMockContext();
  makeSequenceWithBothFeet().draw(ctx as never);

  expect(strokes).toContain(TRACE_COLOR_L);
  expect(strokes).toContain(TRACE_COLOR_R);
});

test("drawing a sequence with no drawable foot data does not crash", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  sequence.keyframes.footL = [
    new FootKeyframe(0 as PathCoordinate, { position: new Vector(0, 0, 0) }),
    new FootKeyframe(1 as PathCoordinate, { position: new Vector(0, 0, 0) }),
  ];
  expect(sequence.elements).toHaveLength(0);

  const ctx = {
    scale: () => {},
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
  };
  expect(() => sequence.draw(ctx as never)).not.toThrow();
});

test("replaceElement swaps an element in place and rebuilds its keyframes", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  const start = 0.25 as PathCoordinate;
  const end = 0.75 as PathCoordinate;
  const turn = new LeftForwardOutsideThreeTurn("footL", start, end, true, true);
  sequence.addElement(turn);

  expect(sequence.keyframes.footL.every((kf) => kf.data.position!.y === 0)).toBe(true);

  const loop = new LeftForwardOutsideLoop("footL", start, end, true, true);
  sequence.replaceElement(turn, loop);

  expect(sequence.elements).toHaveLength(1);
  expect(sequence.elements[0]).toBe(loop);
  expect(sequence.elements[0]!.start).toBe(start);
  expect(sequence.elements[0]!.end).toBe(end);
  expect(sequence.keyframes.footL.some((kf) => kf.data.position !== undefined)).toBe(true);
});

function makeTwoCurveStraightPath(): Path {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  return path;
}

function makeSequenceWithBothFeetOnPath(path: Path, uEnd: number): Sequence {
  const sequence = new Sequence(path);
  const orientation = new Quaternion(1, new Vector<3>(0, 0, 0));
  const position = new Vector<3>(0, 0, 0);
  for (const foot of ["footL", "footR"] as const) {
    sequence.addKeyframe(
      foot,
      new FootKeyframe(0 as PathCoordinate, {
        position: position.copy(),
        orientation: orientation.copy(),
        contactPoint: 0.5,
      }),
    );
    sequence.addKeyframe(
      foot,
      new FootKeyframe(uEnd as PathCoordinate, {
        position: position.copy(),
        orientation: orientation.copy(),
        contactPoint: 0.5,
      }),
    );
  }
  return sequence;
}

test("foot trace culling skips curves outside the viewport", () => {
  const sequence = makeSequenceWithBothFeetOnPath(makeTwoCurveStraightPath(), 2);
  const full = makeMockContext();
  const culled = makeMockContext();
  sequence.drawTraces(culled.ctx as never, undefined, undefined, undefined, undefined, {
    minX: -100,
    maxX: 0.7,
    minY: -100,
    maxY: 100,
  });
  sequence.drawTraces(full.ctx as never);

  expect(culled.strokes.length).toBeGreaterThan(0);
  expect(culled.strokes.length).toBeLessThan(full.strokes.length);
  for (const line of [...culled.lines]) {
    expect(Math.max(line.x1, line.x2)).toBeLessThanOrEqual(1);
    expect(Math.max(line.x1, line.x2)).toBeLessThanOrEqual(0.7 + 0.25 + 0.03);
  }
});

test("a fully visible viewport draws the same trace as no viewport", () => {
  const sequence = makeSequenceWithBothFeetOnPath(makeTwoCurveStraightPath(), 2);
  const plain = makeMockContext();
  const viewport = makeMockContext();
  sequence.drawTraces(plain.ctx as never);
  sequence.drawTraces(viewport.ctx as never, undefined, undefined, undefined, undefined, {
    minX: -100,
    maxX: 100,
    minY: -100,
    maxY: 100,
  });

  expect(viewport.strokes).toEqual(plain.strokes);
  expect(viewport.lines).toHaveLength(plain.lines.length);
  for (let i = 0; i < viewport.lines.length; i++) {
    const a = viewport.lines[i]!;
    const b = plain.lines[i]!;
    expect(a.x1).toBeCloseTo(b.x1, 9);
    expect(a.x2).toBeCloseTo(b.x2, 9);
    expect(a.y1).toBeCloseTo(b.y1, 9);
    expect(a.y2).toBeCloseTo(b.y2, 9);
  }
});

test("Curve.intersectsRect keeps touching and culls fully outside boxes", () => {
  const curve = new Curve(new Vector(0, 0), new Vector(1, 2), new Vector(3, 2), new Vector(4, 0));
  expect(curve.intersectsRect({ minX: -1, maxX: 0, minY: -1, maxY: 1 })).toBe(true);
  expect(curve.intersectsRect({ minX: 3, maxX: 4, minY: 0, maxY: 1 })).toBe(true);
  expect(curve.intersectsRect({ minX: -3, maxX: -1, minY: -1, maxY: 1 })).toBe(false);
  expect(curve.intersectsRect({ minX: 5, maxX: 6, minY: -1, maxY: 1 })).toBe(false);
  expect(curve.intersectsRect({ minX: 0, maxX: 1, minY: 2.1, maxY: 3 })).toBe(false);
  expect(curve.intersectsRect({ minX: 0, maxX: 1, minY: 2.1, maxY: 3 }, 0.1)).toBe(true);
  expect(curve.intersectsRect({ minX: 0, maxX: 1, minY: 2.2, maxY: 3 }, 0.1)).toBe(false);
});

test("Timing keyframes round-trip through JSON", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  sequence.addKeyframe("time", new TimingKeyframe(0.5 as PathCoordinate, "time", 1.5));
  sequence.addKeyframe("time", new TimingKeyframe(1 as PathCoordinate, "beats", 2));

  const loaded = Sequence.fromJSON(JSON.parse(JSON.stringify(sequence.toJSON())));
  expect(loaded.keyframes.time).toHaveLength(3);
  const time = loaded.keyframes.time.find((keyframe) => keyframe.kind === "time" && (keyframe.pathCoordinate as number) > 0);
  const beats = loaded.keyframes.time.find((keyframe) => keyframe.kind === "beats");
  expect(time?.pathCoordinate).toBeCloseTo(0.5);
  expect(time?.value).toBeCloseTo(1.5);
  expect(beats?.pathCoordinate).toBeCloseTo(1);
  expect(beats?.value).toBe(2);
});

test("Legacy time keyframe entries load as time-type timing keyframes", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  sequence.addKeyframe("time", new TimingKeyframe(1 as PathCoordinate, "time", 2));
  const json = sequence.toJSON();
  json.keyframes.time = [
    {
      kind: "TimeKeyframe",
      coordinate: 0,
      data: { pathCoordinate: 0 },
      transitionIn: "linear",
      transitionOut: "linear",
    },
    {
      kind: "TimeKeyframe",
      coordinate: 2,
      data: { pathCoordinate: 1 },
      transitionIn: "linear",
      transitionOut: "linear",
    },
  ] as typeof json.keyframes.time;

  const loaded = Sequence.fromJSON(json);
  expect(loaded.keyframes.time).toHaveLength(2);
  for (const keyframe of loaded.keyframes.time) expect(keyframe.kind).toBe("time");
  expect(loaded.keyframes.time[1]?.pathCoordinate).toBeCloseTo(1);
  expect(loaded.keyframes.time[1]?.value).toBeCloseTo(2);
});
