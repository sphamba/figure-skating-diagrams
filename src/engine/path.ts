import { Curve, type Curvilinear } from "./curve.js";
import type { PathCoordinate } from "./coordinates.js";
import type { CanvasRenderingContext2DSized } from "./rinkCanvas.js";
import { Vector } from "./vector.js";

export class Path {
  curves: Curve[];
  length: number;

  constructor() {
    this.curves = [];
    this.length = 0;
  }

  updateLength() {
    for (const curve of this.curves) {
      curve.updateLength();
    }
    this.length = this.curves.reduce((sum, curve) => sum + curve.length, 0);
  }

  toJSON(): { curves: ReturnType<Curve["toJSON"]>[] } {
    return { curves: this.curves.map((curve) => curve.toJSON()) };
  }

  static fromJSON(json: { curves: ReturnType<Curve["toJSON"]>[] }): Path {
    const path = new Path();
    path.curves = json.curves.map((curve) => Curve.fromJSON(curve));
    path.connectJoints();
    path.updateLength();
    return path;
  }

  private connectJoints() {
    const equal = (a: Vector<2>, b: Vector<2>) => a.x === b.x && a.y === b.y;
    for (let i = 1; i < this.curves.length; i++) {
      const previous = this.curves[i - 1]!;
      const curve = this.curves[i]!;
      if (equal(curve.p0, previous.p3)) curve.p0 = previous.p3;
    }
  }

  getCurveAndCurvilinearCoord(u: PathCoordinate): [Curve, Curvilinear] {
    if (this.curves.length == 0) {
      throw new Error("Path has no curve.");
    }

    if (u < 0 || u > this.length) {
      throw new RangeError("Uniform coordinate out of range.");
    }

    let cumulatedLength = 0;
    let curve = this.curves[0]!;
    for (curve of this.curves) {
      if (u - cumulatedLength < curve.length) break;
      if (curve == this.curves[this.curves.length - 1]) break;
      cumulatedLength += curve.length;
    }

    const uniformCoordinate = u - cumulatedLength;
    const curvilinearCoordinate = curve.getCurvilinearCoordFromUniform(uniformCoordinate);

    return [curve, curvilinearCoordinate];
  }

  getPosition(u: PathCoordinate): Vector<2> {
    const [curve, curvilinearCoordinate] = this.getCurveAndCurvilinearCoord(u);
    return curve.getPosition(curvilinearCoordinate);
  }

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

  moveAlongByArcLength(u: PathCoordinate, offset: number): PathCoordinate {
    if (this.curves.length === 0) return 0 as PathCoordinate;
    const uu = Math.max(0, Math.min(this.length, u as number));

    let [curve, t] = this.getCurveAndCurvilinearCoord(uu as PathCoordinate);
    let idx = this.curves.indexOf(curve);
    let remaining = offset;

    if (offset >= 0) {
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

  private coordinateFor(curveIndex: number, s: Curvilinear): PathCoordinate {
    let cumulated = 0;
    for (let i = 0; i < curveIndex; i++) cumulated += this.curves[i]!.length;
    const curve = this.curves[curveIndex]!;
    return (cumulated + curve.getUniformCoordFromCurvilinear(s)) as PathCoordinate;
  }

  getDerivative(u: PathCoordinate): Vector<2> {
    const [curve, curvilinearCoordinate] = this.getCurveAndCurvilinearCoord(u);
    return curve.getDerivative(curvilinearCoordinate);
  }

  addCurveEnd(newCurve?: Curve) {
    newCurve ??= this.createNewEndCurve();
    const lastCurve = this.curves[this.curves.length - 1];
    if (lastCurve && newCurve != lastCurve) {
      newCurve.p0 = lastCurve.p3;
    }

    this.curves.push(newCurve);
    this.updateLength();
  }

  createNewEndCurve(): Curve {
    const lastCurve = this.curves[this.curves.length - 1];
    let p0: Vector<2>;
    let dir: Vector<2>;

    if (this.curves.length == 0) {
      p0 = new Vector<2>(0, -0.5);
      dir = new Vector<2>(0, 1);
    } else {
      p0 = lastCurve!.p3;
      dir = lastCurve!.getDerivative(1 as Curvilinear).normalized();
    }

    let handleLength = 5 / 2;
    if (this.curves.length > 0) {
      const lastHandleLength = lastCurve!.p2.minus(lastCurve!.p3).length();
      if (lastHandleLength > 0) handleLength = lastHandleLength;
    }

    return new Curve(p0, p0.plus(dir.times(handleLength)), p0.plus(dir.times(5 / 2)), p0.plus(dir.times(5)));
  }

  addCurveStart(newCurve?: Curve) {
    newCurve ??= this.createNewStartCurve();

    const firstCurve = this.curves[0];
    if (firstCurve && newCurve != firstCurve) {
      newCurve.p3 = firstCurve.p0;
    }

    this.curves.unshift(newCurve);
    this.updateLength();
  }

  createNewStartCurve(): Curve {
    const firstCurve = this.curves[0];
    let p0: Vector<2>;
    let dir: Vector<2>;

    if (this.curves.length == 0) {
      p0 = new Vector<2>(0, -0.5);
      dir = new Vector<2>(0, 1);
    } else {
      p0 = firstCurve!.p0;
      dir = firstCurve!
        .getDerivative(0 as Curvilinear)
        .times(-1)
        .normalized();
    }

    let handleLength = 5 / 2;
    if (this.curves.length > 0) {
      const firstHandleLength = firstCurve!.p1.minus(firstCurve!.p0).length();
      if (firstHandleLength > 0) handleLength = firstHandleLength;
    }

    return new Curve(p0, p0.plus(dir.times(handleLength)), p0.plus(dir.times(5 / 2)), p0.plus(dir.times(5)));
  }

  cut(curveIndex: number, x: Curvilinear) {
    if (curveIndex < 0 || curveIndex >= this.curves.length) {
      throw new Error("Curve not in Path.");
    }
    const curve = this.curves[curveIndex]!;
    const [curve1, curve2] = curve.cut(x);

    const curvesBefore = this.curves.slice(0, curveIndex);
    const curvesAfter = this.curves.slice(curveIndex + 1);

    if (curvesBefore.length > 0) {
      curve1.p0 = curvesBefore[curvesBefore.length - 1]!.p3;
    }
    curve2.p0 = curve1.p3;
    if (curvesAfter.length > 0) {
      curve2.p3 = curvesAfter[0]!.p0;
    }

    this.curves = [...curvesBefore, curve1, curve2, ...curvesAfter];
    this.updateLength();
  }

  removePoint(point: Vector<2>) {
    const [curveBefore, curveAfter] = this.getCurvesAroundPoint(point);

    const merged = new Curve(curveBefore.p0, curveBefore.p1, curveAfter.p2, curveAfter.p3);

    const curvesBefore = this.curves.slice(0, this.curves.indexOf(curveBefore));
    const curvesAfter = this.curves.slice(this.curves.indexOf(curveAfter) + 1);

    if (curvesBefore.length > 0) {
      merged.p0 = curvesBefore[curvesBefore.length - 1]!.p3;
    }
    if (curvesAfter.length > 0) {
      merged.p3 = curvesAfter[0]!.p0;
    }

    this.curves = [...curvesBefore, merged, ...curvesAfter];
    this.updateLength();
  }

  removeEndCurve() {
    if (this.curves.length > 0) {
      this.curves.pop();
      this.updateLength();
    }
  }

  removeStartCurve() {
    if (this.curves.length > 0) {
      this.curves.shift();
      this.updateLength();
    }
  }

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

  pickCurve(point: Vector<2>, tolerance: number): { curveIndex: number; curve: Curve; distance: number } | null {
    let bestIndex = -1;
    let bestCurve: Curve | null = null;
    let bestDistance = Infinity;

    this.curves.forEach((curve, curveIndex) => {
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

  draw(ctx: CanvasRenderingContext2DSized, _uStart: PathCoordinate = 0 as PathCoordinate, uEnd?: PathCoordinate) {
    uEnd ??= this.length as PathCoordinate;
    this.curves.forEach((curve) => curve.draw(ctx));
  }

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

      if (curveEnd <= start) continue;
      if (curveStart >= end) break;

      if (curveStart >= start && curveEnd <= end) {
        curve.draw(ctx);
        continue;
      }

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

function drawSubBezier(ctx: CanvasRenderingContext2DSized, curve: Curve, sStart: number, sEnd: number) {
  if (sEnd <= sStart) return;

  let points = [curve.p0, curve.p1, curve.p2, curve.p3];

  if (sStart > 0) {
    points = splitBezierAt(points[0]!, points[1]!, points[2]!, points[3]!, sStart)[1];
  }

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
