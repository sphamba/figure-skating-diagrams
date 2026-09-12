import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Sequence, traceWidth } from "../src/engine/sequence";
import type { PathCoordinate } from "../src/engine/coordinates";
import type { CanvasRenderingContext2DSized } from "../src/engine/rinkCanvas";
import { Vector } from "../src/engine/vector";
import { jumpConstructorsByType, Jump } from "../src/engine/element/jump";
import { bladeLength, maxBladeLength } from "../src/engine/constants";

function toeLoopSequence() {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(5 / 3, 0), new Vector(10 / 3, 0), new Vector(5, 0)));
  const sequence = new Sequence(path);
  const toeLoop = new (jumpConstructorsByType["ToeLoop1"] as unknown as new (start: number, end: number) => Jump)(0, 2);
  sequence.addElement(toeLoop);
  return sequence;
}

function makeCtx() {
  const strokes: Array<Array<{ x: number; y: number }>> = [];
  const ctx: Record<string, unknown> = { width: 0, height: 0, globalAlpha: 1 };
  ctx.beginPath = () => strokes.push([]);
  ctx.moveTo = (x: number, y: number) => strokes[strokes.length - 1]?.push({ x, y });
  ctx.lineTo = (x: number, y: number) => strokes[strokes.length - 1]?.push({ x, y });
  ctx.stroke = () => {};
  return { ctx: ctx as unknown as CanvasRenderingContext2DSized, strokes };
}

function segmentLength(points: Array<{ x: number; y: number }>): number {
  expect(points).toHaveLength(2);
  const [a, b] = points as [{ x: number; y: number }, { x: number; y: number }];
  return Math.hypot(b.x - a.x, b.y - a.y);
}

const markSize = 0.03;

test("toe-pick marks are drawn as little crosses in the foot trace color", () => {
  const sequence = toeLoopSequence();
  // ToeLoop1: the free foot (footL) picks at 10%, the take-off foot (footR) picks at the 95% landing.
  const leftPicks = sequence.keyframes.footL.filter((keyframe) => keyframe.data.toePick === true);
  const rightPicks = sequence.keyframes.footR.filter((keyframe) => keyframe.data.toePick === true);
  expect(leftPicks).toHaveLength(1);
  expect(rightPicks).toHaveLength(1);

  const left = makeCtx();
  sequence.drawFootTrace(left.ctx, "footL", 0 as PathCoordinate, sequence.path.length as PathCoordinate);
  // The marks are drawn last: two strokes per mark, each spanning the full mark diameter.
  const leftMarks = left.strokes.slice(-2 * leftPicks.length);
  expect(leftMarks).toHaveLength(2);
  for (const points of leftMarks) {
    expect(segmentLength(points)).toBeCloseTo(markSize, 10);
  }
  const right = makeCtx();
  sequence.drawFootTrace(right.ctx, "footR", 0 as PathCoordinate, sequence.path.length as PathCoordinate);
  const rightMarks = right.strokes.slice(-2 * rightPicks.length);
  expect(rightMarks).toHaveLength(2);
  for (const points of rightMarks) {
    expect(segmentLength(points)).toBeCloseTo(markSize, 10);
  }
  expect(left.ctx.strokeStyle).toBe(sequence.traceColorL);
  expect(right.ctx.strokeStyle).toBe(sequence.traceColorR);
  expect(left.ctx.lineWidth).toBeCloseTo(traceWidth, 10);
  expect(right.ctx.lineWidth).toBeCloseTo(traceWidth, 10);
});

test("toe-pick mark crosses account for the foot position and orientation", () => {
  const sequence = toeLoopSequence();
  const toePick = sequence.keyframes.footL.find((keyframe) => keyframe.data.toePick === true)!;
  const data = toePick.data;
  const { ctx, strokes } = makeCtx();
  sequence.drawFootTrace(ctx, "footL", 0 as PathCoordinate, sequence.path.length as PathCoordinate);

  expect(data.position!.z).toBeCloseTo(0, 10);
  expect(data.contactPoint).toBe(1);
  expect(data.position!.x).toBeCloseTo(0, 10);
  expect(data.position!.y).toBeCloseTo(0, 10);
  // Straight +x path: pathAngle 0, so the backward foot orientation (Math.PI) rotates the
  // relative blade position by 180 degrees around the path point.
  const relativeX = data.position!.x + (data.contactPoint! - 0.5) * bladeLength;
  const worldX = (toePick.coordinate as number) - relativeX;
  const worldY = -data.position!.y;

  const [diagonalDown, diagonalUp] = strokes.slice(-2) as [
    Array<{ x: number; y: number }>,
    Array<{ x: number; y: number }>,
  ];
  const dx = markSize / 2 / Math.SQRT2;
  // Canvas y is the negated world y. The first stroke runs from canvas (worldX - dx, -(worldY - dx))
  // to (worldX + dx, -(worldY + dx)), the second one crosses it the other way.
  expect(diagonalDown[0]!.x).toBeCloseTo(worldX - dx, 10);
  expect(diagonalDown[0]!.y).toBeCloseTo(-worldY + dx, 10);
  expect(diagonalDown[1]!.x).toBeCloseTo(worldX + dx, 10);
  expect(diagonalDown[1]!.y).toBeCloseTo(-worldY - dx, 10);

  expect(diagonalUp[0]!.x).toBeCloseTo(worldX - dx, 10);
  expect(diagonalUp[0]!.y).toBeCloseTo(-worldY - dx, 10);
  expect(diagonalUp[1]!.x).toBeCloseTo(worldX + dx, 10);
  expect(diagonalUp[1]!.y).toBeCloseTo(-worldY + dx, 10);
});

test("cross size keeps the minimum mark size and freezes with the blade scaling", () => {
  const sequence = toeLoopSequence();
  // With element scaling on and minBladeLength above maxBladeLength the cross is frozen at
  // maxBladeLength * minMarkSize / minBladeLength.
  const clamped = makeCtx();
  sequence.drawFootTrace(
    clamped.ctx,
    "footL",
    0 as PathCoordinate,
    sequence.path.length as PathCoordinate,
    undefined,
    2 * maxBladeLength,
    0.06,
  );
  for (const points of clamped.strokes.slice(-2)) {
    expect(segmentLength(points)).toBeCloseTo(maxBladeLength * (0.06 / (2 * maxBladeLength)), 10);
  }

  // Without element scaling the cross only keeps the passed minimum.
  const unclamped = makeCtx();
  sequence.drawFootTrace(
    unclamped.ctx,
    "footL",
    0 as PathCoordinate,
    sequence.path.length as PathCoordinate,
    undefined,
    undefined,
    0.06,
  );
  for (const points of unclamped.strokes.slice(-2)) {
    expect(segmentLength(points)).toBeCloseTo(0.06, 10);
  }
});

test("mark line thickness follows the trace thickness with the minimum clamp", () => {
  const sequence = toeLoopSequence();
  const clamped = makeCtx();
  sequence.drawFootTrace(
    clamped.ctx,
    "footR",
    0 as PathCoordinate,
    sequence.path.length as PathCoordinate,
    0.01,
  );
  expect(clamped.ctx.lineWidth).toBeCloseTo(Math.max(traceWidth, 0.01), 10);
});
