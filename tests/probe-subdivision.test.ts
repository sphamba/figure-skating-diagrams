import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { LeftForwardInsideLoop } from "../src/engine/element/loop";
import { getUnitVectorFromAngle, Vector } from "../src/engine/vector";
import { Curve } from "../src/engine/curve";

function getArcCurve(center: Vector<2>, radius: number, startAngle: number, endAngle: number): Curve {
  const angle = endAngle - startAngle;
  const startNormal = getUnitVectorFromAngle(startAngle);
  const endNormal = getUnitVectorFromAngle(endAngle);
  const startTangent = startNormal.getOrthogonal().times(Math.sign(angle));
  const endTangent = endNormal.getOrthogonal().times(-Math.sign(angle));
  const controlPointDistance = (4 / 3) * Math.tan(Math.abs(angle) / 4) * radius;

  const p0 = center.plus(startNormal.times(radius));
  const p1 = p0.plus(startTangent.times(controlPointDistance));
  const p3 = center.plus(endNormal.times(radius));
  const p2 = p3.plus(endTangent.times(controlPointDistance));

  return new Curve(p0, p1, p2, p3);
}

class CountingContext {
  strokes = 0;
  private moveToX = 0;
  private moveToY = 0;
  globalAlpha = 1;
  lineWidth = 1;
  strokeStyle = "";
  setLineDash() {}
  beginPath() {}
  moveTo(x: number, y: number) {
    this.moveToX = x;
    this.moveToY = y;
  }
  lineTo() {}
  bezierCurveTo() {}
  arc() {}
  stroke() {
    this.strokes++;
  }
}

function buildLoopSequence(): Sequence {
  const radius = 1.2;
  const path = new Path();
  path.addCurveEnd(getArcCurve(new Vector(-radius * 0.4, 0), radius, -Math.PI / 2, Math.PI / 2));
  path.addCurveEnd(getArcCurve(new Vector(radius * 0.4, 0), radius, Math.PI / 2, (3 * Math.PI) / 2));
  const sequence = new Sequence(path);
  const start = path.length * 0.3;
  const loop = new LeftForwardInsideLoop("footL", start as PathCoordinate, (start + 0.1) as PathCoordinate);
  sequence.addElement(loop);
  return sequence;
}

test("loop trace keeps segment count at a large draw increment", () => {
  const sequence = buildLoopSequence();
  type TraceContext = Parameters<Sequence["drawTraces"]>[0];
  const unzoomed = new CountingContext() as unknown as TraceContext;
  sequence.drawTraces(unzoomed, undefined, undefined, undefined, 0.2);
  const fine = new CountingContext() as unknown as TraceContext;
  sequence.drawTraces(fine);

  expect(unzoomed.strokes).toBeGreaterThan(10);
  expect(unzoomed.strokes).toBeLessThan(fine.strokes);
});
