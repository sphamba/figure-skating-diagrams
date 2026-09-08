import { Curve, type Curvilinear } from "./curve.js";
import type { PathCoordinate } from "./coordinates.js";
import type { CanvasRenderingContext2DSized } from "./rinkCanvas.js";
import { Vector } from "./vector.js";

export class Path {
  curves: Curve[];
  length: number;

  /** Chain of Curves describing path of body gravity center above the ice.*/
  constructor() {
    this.curves = [];
    this.length = 0;
  }

  updateLength() {
    // Recompute every curve first: control points can change at any time (drag
    // in the path editor, alignment, cuts), and a curve's stored length and
    // uniform-coordinate table are only valid for the control points those
    // tables were built from. Summing stale values makes the uniform
    // coordinate axis (which path coordinates and element spans are defined
    // on) drift away from the real geometry, so an element spanning a fixed
    // path-coordinate range changes its real (drawn) length after any edit.
    for (const curve of this.curves) {
      curve.updateLength();
    }
    this.length = this.curves.reduce((sum, curve) => sum + curve.length, 0);
  }

  /** Serialize to a plain JSON object. */
  toJSON(): { curves: ReturnType<Curve["toJSON"]>[] } {
    return { curves: this.curves.map((curve) => curve.toJSON()) };
  }

  /** Reconstruct a Path from serialized data. */
  static fromJSON(json: { curves: ReturnType<Curve["toJSON"]>[] }): Path {
    const path = new Path();
    path.curves = json.curves.map((curve) => Curve.fromJSON(curve));
    path.updateLength();
    return path;
  }

  /** @param u - Uniform path coordinate, from 0 to path length */
  getCurveAndCurvilinearCoord(u: PathCoordinate): [Curve, Curvilinear] {
    if (this.curves.length == 0) {
      throw new Error("Path has no curve.");
    }

    if (u < 0 || u > this.length) {
      throw new RangeError("Uniform coordinate out of range.");
    }

    // Find curve containing u
    let cumulatedLength = 0;
    let curve = this.curves[0]!;
    for (curve of this.curves) {
      if (u - cumulatedLength < curve.length) break;
      if (curve == this.curves[this.curves.length - 1]) break;
      cumulatedLength += curve.length;
    }

    // Compute coordinate in curve
    const uniformCoordinate = u - cumulatedLength;
    const curvilinearCoordinate = curve.getCurvilinearCoordFromUniform(uniformCoordinate);

    return [curve, curvilinearCoordinate];
  }

  /** @param u - Uniform path coordinate, from 0 to path length */
  getPosition(u: PathCoordinate): Vector<2> {
    const [curve, curvilinearCoordinate] = this.getCurveAndCurvilinearCoord(u);
    return curve.getPosition(curvilinearCoordinate);
  }

  /**
   * Real (geometric) arc length of the path between two path coordinates.
   *
   * This integrates the actual curve geometry at a fine resolution, so it is
   * independent of the coarse uniform-coordinate lookup table used by
   * `getPosition`. Two elements that measure the same arc length here really
   * render with the same on-screen length, regardless of how curved or uneven
   * the underlying curves are.
   *
   * @param uStart - Path coordinate where the measured range starts.
   * @param uEnd - Path coordinate where the measured range ends.
   *        The range is clamped to `[0, path.length]`.
   */
  arcLengthBetween(uStart: PathCoordinate, uEnd: PathCoordinate): number {
    if (this.curves.length === 0) return 0;
    const start = Math.max(0, uStart as number);
    const end = Math.min(this.length, uEnd as number);
    if (end <= start) return 0;

    const [cStart, tStart] = this.getCurveAndCurvilinearCoord(start as PathCoordinate);
    const [cEnd, tEnd] = this.getCurveAndCurvilinearCoord(end as PathCoordinate);
    const iStart = this.curves.indexOf(cStart);
    const iEnd = this.curves.indexOf(cEnd);

    if (iStart === iEnd) {
      return cStart.arcLength(tStart, tEnd);
    }

    let total = cStart.arcLength(tStart, 1 as Curvilinear);
    for (let i = iStart + 1; i < iEnd; i++) {
      total += this.curves[i]!.arcLength(0 as Curvilinear, 1 as Curvilinear);
    }
    total += cEnd.arcLength(0 as Curvilinear, tEnd);
    return total;
  }

  /**
   * Path coordinate reached by walking `offset` metres of real (geometric)
   * arc length from `u`. A positive offset walks forward (increasing path
   * coordinate), a negative offset walks backward. The result is clamped to
   * `[0, path.length]`.
   *
   * The walk uses the same fine arc-length integration as `arcLengthBetween`,
   * so `arcLengthBetween(u, moveAlongByArcLength(u, l))` is exactly `|l|`
   * (up to integration resolution) even across strongly non-uniform curves.
   */
  moveAlongByArcLength(u: PathCoordinate, offset: number): PathCoordinate {
    if (this.curves.length === 0) return 0 as PathCoordinate;
    const uu = Math.max(0, Math.min(this.length, u as number));

    let [curve, t] = this.getCurveAndCurvilinearCoord(uu as PathCoordinate);
    let idx = this.curves.indexOf(curve);
    let remaining = offset;

    if (offset >= 0) {
      // Walk forward along the path.
      for (;;) {
        const seg = curve.arcLength(t, 1 as Curvilinear);
        if (remaining <= seg) {
          return this.coordinateFor(idx, arcLengthForwardTarget(curve, t, remaining));
        }
        remaining -= seg;
        if (idx >= this.curves.length - 1) return this.length as PathCoordinate;
        idx += 1;
        curve = this.curves[idx]!;
        t = 0 as Curvilinear;
      }
    }

    // Walk backward along the path.
    remaining = -offset;
    for (;;) {
      const seg = curve.arcLength(0 as Curvilinear, t);
      if (remaining <= seg) {
        return this.coordinateFor(idx, arcLengthBackwardTarget(curve, t, remaining));
      }
      remaining -= seg;
      if (idx <= 0) return 0 as PathCoordinate;
      idx -= 1;
      curve = this.curves[idx]!;
      t = 1 as Curvilinear;
    }
  }

  /**
   * Path coordinate for a curved point given as a curve index and a
   * curvilinear parameter. Uses the same coarse cumulated lengths and the same
   * within-curve uniform mapping as `getCurveAndCurvilinearCoord`, so the two
   * are consistent round-trips.
   */
  private coordinateFor(curveIndex: number, s: Curvilinear): PathCoordinate {
    let cumulated = 0;
    for (let i = 0; i < curveIndex; i++) cumulated += this.curves[i]!.length;
    const curve = this.curves[curveIndex]!;
    return (cumulated + curve.getUniformCoordFromCurvilinear(s)) as PathCoordinate;
  }

  /** @param u - Uniform path coordinate, from 0 to path length */
  getDerivative(u: PathCoordinate): Vector<2> {
    const [curve, curvilinearCoordinate] = this.getCurveAndCurvilinearCoord(u);
    return curve.getDerivative(curvilinearCoordinate);
  }

  addCurveEnd(newCurve?: Curve) {
    newCurve ??= this.createNewEndCurve();
    // Match endpoints
    const lastCurve = this.curves[this.curves.length - 1];
    if (lastCurve && newCurve != lastCurve) {
      newCurve.p0 = lastCurve.p3;
    }

    this.curves.push(newCurve);
    this.updateLength();
  }

  /** Create 3m straight curve aligned with end of Path (or at center of rink if Path empty).*/
  createNewEndCurve(): Curve {
    const lastCurve = this.curves[this.curves.length - 1];
    let p0: Vector<2>;
    let dir: Vector<2>;

    if (this.curves.length == 0) {
      // 3m straight line at center of rink
      p0 = new Vector<2>(0, -0.5);
      dir = new Vector<2>(0, 1);
    } else {
      // Take last point of chain and keep direction
      p0 = lastCurve!.p3;
      dir = lastCurve!.getDerivative(1 as Curvilinear).normalized();
    }

    // Keep the handle length continuous with the previous curve
    let handleLength = 3 / 2;
    if (this.curves.length > 0) {
      const lastHandleLength = lastCurve!.p2.minus(lastCurve!.p3).length();
      if (lastHandleLength > 0) handleLength = lastHandleLength;
    }

    return new Curve(p0, p0.plus(dir.times(handleLength)), p0.plus(dir.times(3 / 2)), p0.plus(dir.times(3))); // 3m straight line
  }

  addCurveStart(newCurve?: Curve) {
    newCurve ??= this.createNewStartCurve();

    // Match endpoints
    const firstCurve = this.curves[0];
    if (firstCurve && newCurve != firstCurve) {
      newCurve.p3 = firstCurve.p0;
    }

    this.curves.unshift(newCurve);
    this.updateLength();
  }

  /** Create 3m straight curve aligned with start of Path (or at center of rink if Path empty).*/
  createNewStartCurve(): Curve {
    const firstCurve = this.curves[0];
    let p0: Vector<2>;
    let dir: Vector<2>;

    if (this.curves.length == 0) {
      // 3m straight line at center of rink
      p0 = new Vector<2>(0, -0.5);
      dir = new Vector<2>(0, 1);
    } else {
      // Take first point of chain and keep direction
      p0 = firstCurve!.p0;
      dir = firstCurve!
        .getDerivative(0 as Curvilinear)
        .times(-1)
        .normalized();
    }

    // Keep the handle length continuous with the next curve
    let handleLength = 3 / 2;
    if (this.curves.length > 0) {
      const firstHandleLength = firstCurve!.p1.minus(firstCurve!.p0).length();
      if (firstHandleLength > 0) handleLength = firstHandleLength;
    }

    return new Curve(p0, p0.plus(dir.times(handleLength)), p0.plus(dir.times(3 / 2)), p0.plus(dir.times(3))); // 3m straight line
  }

  /** @param curveIndex - Index of curve in Path
   *   @param x - Curvilinear coordinate */
  cut(curveIndex: number, x: Curvilinear) {
    if (curveIndex < 0 || curveIndex >= this.curves.length) {
      throw new Error("Curve not in Path.");
    }
    const curve = this.curves[curveIndex]!;
    const [curve1, curve2] = curve.cut(x);

    // Remaining curves
    const curvesBefore = this.curves.slice(0, curveIndex);
    const curvesAfter = this.curves.slice(curveIndex + 1);

    // Match endpoints
    if (curvesBefore.length > 0) {
      curve1.p0 = curvesBefore[curvesBefore.length - 1]!.p3;
    }
    curve2.p0 = curve1.p3;
    if (curvesAfter.length > 0) {
      curve2.p3 = curvesAfter[0]!.p0;
    }

    // Replace cut curve in array by c1 and c2
    this.curves = [...curvesBefore, curve1, curve2, ...curvesAfter];
    this.updateLength();
  }

  /** @ param p - Point in Path */
  removePoint(point: Vector<2>) {
    const [curveBefore, curveAfter] = this.getCurvesAroundPoint(point);

    // Merge the two neighbours into a single curve that keeps the surviving
    // control points unchanged: the start and first handle of the curve before
    // the removed joint, and the last handle and end of the curve after it.
    // The removed joint and its two adjacent handles are dropped.
    const merged = new Curve(curveBefore.p0, curveBefore.p1, curveAfter.p2, curveAfter.p3);

    // Remaining curves
    const curvesBefore = this.curves.slice(0, this.curves.indexOf(curveBefore));
    const curvesAfter = this.curves.slice(this.curves.indexOf(curveAfter) + 1);

    // Match endpoints
    if (curvesBefore.length > 0) {
      merged.p0 = curvesBefore[curvesBefore.length - 1]!.p3;
    }
    if (curvesAfter.length > 0) {
      merged.p3 = curvesAfter[0]!.p0;
    }

    // Replace curveBefore and curveAfter in array by the merged curve
    this.curves = [...curvesBefore, merged, ...curvesAfter];
    this.updateLength();
  }

  /** Remove the final curve, shortening the path at its end. */
  removeEndCurve() {
    if (this.curves.length > 0) {
      this.curves.pop();
      this.updateLength();
    }
  }

  /** Remove the first curve, shortening the path at its start. */
  removeStartCurve() {
    if (this.curves.length > 0) {
      this.curves.shift();
      this.updateLength();
    }
  }

  /** @param point - Point in Path */
  getCurvesAroundPoint(point: Vector<2>): [Curve, Curve] {
    let curveBefore: Curve | undefined;
    let curveAfter: Curve | undefined;

    for (let i = 0; i < this.curves.length - 1; i++) {
      curveBefore = this.curves[i]!;

      if (curveBefore.p3 == point) {
        curveAfter = this.curves[i + 1];
        break;
      }
    }

    if (!curveBefore || !curveAfter) {
      throw new Error("Point not between two curves of Path.");
    }

    return [curveBefore, curveAfter];
  }

  /**
   * Find the curve of the Path closest to a given point, within a tolerance.
   *
   * Curves whose control-point bounding box (the smallest axis-aligned box
   * containing the whole Bezier) does not reach the point are discarded as
   * impossible candidates. Among the remaining curves the closest point on
   * each one is computed and the smallest distance is kept.
   *
   * @param point - The query point, in world units.
   * @param tolerance - Maximum allowed distance, in world units.
   * @returns The index of the closest curve and its distance, or null when no
   *          curve is within tolerance.
   */
  pickCurve(point: Vector<2>, tolerance: number): { curveIndex: number; curve: Curve; distance: number } | null {
    let bestIndex = -1;
    let bestCurve: Curve | null = null;
    let bestDistance = Infinity;

    this.curves.forEach((curve, curveIndex) => {
      // Filter out impossible candidates with the control-point bounding box.
      if (!curve.isPointInBoundingBox(point, tolerance)) return;

      const { distance } = curve.getClosestPoint(point);
      if (distance <= tolerance && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = curveIndex;
        bestCurve = curve;
      }
    });

    if (bestCurve == null) {
      return null;
    }
    return { curveIndex: bestIndex, curve: bestCurve, distance: bestDistance };
  }

  /** @param uStart - Uniform path coordinate where to start drawing, from 0 to path length. Defaults to 0.
   *   @param uEnd - Uniform path coordinate where to end drawing, from 0 to path length. Defaults to path length. */
  draw(ctx: CanvasRenderingContext2DSized, _uStart: PathCoordinate = 0 as PathCoordinate, uEnd?: PathCoordinate) {
    uEnd ??= this.length as PathCoordinate;
    this.curves.forEach((curve) => curve.draw(ctx));
  }

  /**
   * Draw only the portion of the path between the path coordinates `uStart`
   * (inclusive) and `uEnd` (exclusive), using the native canvas cubic Bezier
   * primitive. Curves wholly inside the range are stroked as-is; a boundary
   * curve that is only partially covered is split with de Casteljau so the
   * drawn segment is an exact piece of the original Bezier rather than a
   * piecewise-linear approximation.
   *
   * The caller is responsible for setting the stroke style and line width
   * (each curve is stroked as its own sub-path, matching `draw`).
   *
   * @param ctx - The target canvas context.
   * @param uStart - Path coordinate where the drawn portion starts.
   * @param uEnd - Path coordinate where the drawn portion ends.
   */
  drawRange(ctx: CanvasRenderingContext2DSized, uStart: PathCoordinate, uEnd: PathCoordinate) {
    if (ctx == null || this.curves.length == 0) return;

    const start = Math.max(0, uStart as number);
    const end = Math.min(this.length, uEnd as number);
    if (end <= start) return;

    let cumulated = 0;
    for (const curve of this.curves) {
      const curveStart = cumulated;
      const curveEnd = cumulated + curve.length;
      cumulated = curveEnd;

      if (curveEnd <= start) continue; // Curve entirely before the range.
      if (curveStart >= end) break; // Curve entirely after the range.

      if (curveStart >= start && curveEnd <= end) {
        // Curve fully inside the range: draw the whole Bezier natively.
        curve.draw(ctx);
        continue;
      }

      // Partial overlap: split the curve so the drawn part is an exact
      // sub-Bezier between the covered curvilinear coordinates.
      const sStart = curve.getCurvilinearCoordFromUniform(Math.max(0, start - curveStart));
      const sEnd = curve.getCurvilinearCoordFromUniform(Math.min(curve.length, end - curveStart));
      drawSubBezier(ctx, curve, sStart, sEnd);
    }
  }

  drawNodes(ctx: CanvasRenderingContext2DSized, size: number) {
    const nodes = [...this.curves.map((curve) => curve.p0), this.curves[this.curves.length - 1]!.p3];
    nodes.forEach((node) => {
      ctx.beginPath();
      ctx.arc(node.x, -node.y, size / 2, 0, 2 * Math.PI);
      ctx.fill();
    });
  }
}

/**
 * De Casteljau split of a cubic Bezier at parameter `t`.
 *
 * Returns the two sub-curves [left, right] that together reproduce the exact
 * original Bezier: `left` spans parameter 0 to `t` and `right` spans `t` to 1.
 * The curvilinear coordinates used by `Curve.getPosition` are the Bezier
 * parameter, so splitting at the same value keeps the drawn segment aligned
 * with the path.
 */
/**
 * Curvilinear coordinate on `curve` that is exactly `length` of real arc
 * length ahead of `t` (i.e. arcLength(t, s) == length), found by binary search.
 * Assumes `length` is within arcLength(t, 1).
 */
function arcLengthForwardTarget(curve: Curve, t: Curvilinear, length: number): Curvilinear {
  let lo = t as number;
  let hi = 1;
  const goal = length;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (curve.arcLength(t, mid as Curvilinear) < goal) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) as Curvilinear;
}

/**
 * Curvilinear coordinate on `curve` that is exactly `length` of real arc
 * length behind `t` (i.e. arcLength(s, t) == length), found by binary search.
 * Assumes `length` is within arcLength(0, t).
 */
function arcLengthBackwardTarget(curve: Curve, t: Curvilinear, length: number): Curvilinear {
  let lo = 0;
  let hi = t as number;
  const goal = length;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (curve.arcLength(mid as Curvilinear, t) < goal) hi = mid;
    else lo = mid;
  }
  return ((lo + hi) / 2) as Curvilinear;
}

function splitBezierAt(
  p0: Vector<2>,
  p1: Vector<2>,
  p2: Vector<2>,
  p3: Vector<2>,
  t: number,
): [Vector<2>[], Vector<2>[]] {
  const b01 = p0.plus(p1.minus(p0).times(t));
  const b12 = p1.plus(p2.minus(p1).times(t));
  const b23 = p2.plus(p3.minus(p2).times(t));
  const b012 = b01.plus(b12.minus(b01).times(t));
  const b123 = b12.plus(b23.minus(b12).times(t));
  const b0123 = b012.plus(b123.minus(b012).times(t));
  return [
    [p0, b01, b012, b0123],
    [b0123, b123, b23, p3],
  ];
}

/**
 * Draw the exact sub-Bezier of `curve` between the curvilinear coordinates
 * `sStart` and `sEnd`, using the native canvas `bezierCurveTo` primitive.
 *
 * de Casteljau is applied twice: first the right part is kept from `sStart`
 * to 1, then the left part of that result is kept from 0 to the normalized
 * end parameter. The endpoints land exactly on the original path.
 */
function drawSubBezier(ctx: CanvasRenderingContext2DSized, curve: Curve, sStart: number, sEnd: number) {
  if (sEnd <= sStart) return;

  let points = [curve.p0, curve.p1, curve.p2, curve.p3];

  // Keep the sub-curve from sStart to 1 (the right part of the split).
  if (sStart > 0) {
    points = splitBezierAt(points[0]!, points[1]!, points[2]!, points[3]!, sStart)[1];
  }

  // Truncate the right end to sEnd (parameter normalized within [sStart, 1]).
  const relEnd = sEnd >= 1 ? 1 : (sEnd - sStart) / (1 - sStart);
  if (relEnd < 1) {
    points = splitBezierAt(points[0]!, points[1]!, points[2]!, points[3]!, relEnd)[0];
  }

  const [p0, p1, p2, p3] = points;
  ctx.beginPath();
  ctx.moveTo(p0!.x, -p0!.y);
  ctx.bezierCurveTo(p1!.x, -p1!.y, p2!.x, -p2!.y, p3!.x, -p3!.y);
  ctx.stroke();
}
