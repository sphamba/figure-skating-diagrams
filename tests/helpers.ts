// Shared test helpers. Bodies must stay identical to the originals they
// replace; keep this file free of test-framework dependencies except Vitest
// types where needed.
import { Curve } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { Vector, getUnitVectorFromAngle } from "../src/engine/vector";

/** One metre straight path along x from the origin. */
export function makeStraightLengthOnePath(): Path {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
  return path;
}

/** Left foot keyframe coordinates in path order. */
export function footLCoordinates(sequence: Sequence): number[] {
  return sequence.keyframes.footL.map((keyframe) => keyframe.coordinate);
}

/** Exact cubic Bezier approximation of a circular arc around the center. */
export function getArcCurve(center: Vector<2>, radius: number, startAngle: number, endAngle: number): Curve {
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

/** Cumulated curve starts and lengths of a path. */
export function axisTables(path: Path): { starts: number[]; lengths: number[] } {
  const starts: number[] = [];
  const lengths: number[] = [];
  let cumulated = 0;
  for (const curve of path.curves) {
    starts.push(cumulated);
    lengths.push(curve.length);
    cumulated += curve.length;
  }
  return { starts, lengths };
}

/** Straight curves of length three at 0 m, 3 m and 6 m. `stitch` shares the
 * joint points between neighbouring curves before measuring the length. */
export function makeStraightsJointedPath(stitch = false): Path {
  const straight = (x0: number): Curve =>
    new Curve(new Vector(x0, 0), new Vector(x0 + 1, 0), new Vector(x0 + 2, 0), new Vector(x0 + 3, 0));
  const path = new Path();
  path.curves = [straight(0), straight(3), straight(6)];
  if (stitch) {
    path.curves[1]!.p0 = path.curves[0]!.p3;
    path.curves[2]!.p0 = path.curves[1]!.p3;
  }
  path.updateLength();
  return path;
}

/** Canvas 2D context method names, stubbed as no-ops. */
export const CTX_METHODS = [
  "scale",
  "clearRect",
  "save",
  "restore",
  "beginPath",
  "moveTo",
  "lineTo",
  "bezierCurveTo",
  "stroke",
  "fill",
  "arc",
  "fillRect",
  "strokeRect",
  "translate",
  "rotate",
  "setTransform",
  "closePath",
  "rect",
  "fillText",
];

/** No-op canvas 2D context with a deterministic measureText stub. */
export function makeNoopContext(
  measure: { width: number; ascent: number; descent: number } = { width: 40, ascent: 8, descent: 2 },
): Record<string, unknown> {
  const ctx: Record<string, unknown> = { width: 0, height: 0, globalAlpha: 1 };
  for (const method of CTX_METHODS) ctx[method] = () => {};
  ctx.measureText = () => ({
    width: measure.width,
    actualBoundingBoxAscent: measure.ascent,
    actualBoundingBoxDescent: measure.descent,
  });
  return ctx;
}

/** jsdom canvas element wired to the given no-op context, with fixed
 * client sizes and bounding rect. Needs a jsdom environment. */
export function createStubCanvas(ctx: Record<string, unknown>): HTMLCanvasElement {
  const canvas = document.createElement("canvas") as HTMLCanvasElement & {
    getContext: () => Record<string, unknown>;
  };
  Object.defineProperty(canvas, "clientWidth", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "clientHeight", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "getContext", { value: () => ctx, configurable: true });
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 1024, height: 1024 }),
    configurable: true,
  });
  return canvas;
}
