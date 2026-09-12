import type { CanvasRenderingContext2DSized } from "./rinkCanvas.js";
import { Vector } from "./vector.js";

export type Curvilinear = number & { readonly __tag: unique symbol };

export type AxisRect = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const ds = 0.001 as Curvilinear; // fine curvilinear step for arc-length sampling
const ARC_LENGTH_SAMPLES = 128; // integration steps per curve for the arc-length lookup

export class Curve {
  p0: Vector<2>;
  p1: Vector<2>;
  p2: Vector<2>;
  p3: Vector<2>;
  uniformCoordinates: number[];
  length: number;

  constructor(p0: Vector<2>, p1: Vector<2>, p2: Vector<2>, p3: Vector<2>) {
    this.p0 = p0;
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;

    this.uniformCoordinates = [];
    this.length = 0;
    this.updateLength();
  }

  toJSON(): { p0: number[]; p1: number[]; p2: number[]; p3: number[] } {
    return {
      p0: this.p0.toJSON().data,
      p1: this.p1.toJSON().data,
      p2: this.p2.toJSON().data,
      p3: this.p3.toJSON().data,
    };
  }

  static fromJSON(json: {
    p0: number[] | { data: number[] };
    p1: number[] | { data: number[] };
    p2: number[] | { data: number[] };
    p3: number[] | { data: number[] };
  }): Curve {
    const flat = (point: number[] | { data: number[] }): number[] => (Array.isArray(point) ? point : point.data);
    return new Curve(
      Vector.fromJSON({ data: flat(json.p0) }) as Vector<2>,
      Vector.fromJSON({ data: flat(json.p1) }) as Vector<2>,
      Vector.fromJSON({ data: flat(json.p2) }) as Vector<2>,
      Vector.fromJSON({ data: flat(json.p3) }) as Vector<2>,
    );
  }

  updateLength() {
    this.length = 0;
    this.uniformCoordinates = [0];

    for (let s = 0 as Curvilinear; s < 1; s = (s + ds) as Curvilinear) {
      const dsCorrected = Math.min(ds, 1 - s);

      const derivative = this.getDerivative(s);
      const dl = derivative.length() * dsCorrected;

      this.length += dl;
      this.uniformCoordinates.push(this.length);
    }
  }

  getCurvilinearCoordFromUniform(u: number): Curvilinear {
    if (u >= this.length) return 1 as Curvilinear;

    const upper = this.uniformCoordinates.findIndex((x: number) => x > u);
    if (upper <= 0) return 0 as Curvilinear;

    const lower = upper - 1;
    const uUpper = this.uniformCoordinates[upper]!;
    const uLower = this.uniformCoordinates[lower]!;
    const sUpper = Math.min(upper * ds, 1);
    const sLower = lower * ds;

    return (((u - uLower) / (uUpper - uLower)) * (sUpper - sLower) + sLower) as Curvilinear;
  }

  getHalfLengthCoordinate(): Curvilinear {
    const target = this.arcLength(0 as Curvilinear, 1 as Curvilinear) / 2;

    let lo = 0 as Curvilinear;
    let hi = 1 as Curvilinear;
    for (let i = 0; i < 40; i++) {
      const mid = ((lo + hi) / 2) as Curvilinear;
      if (this.arcLength(0 as Curvilinear, mid) < target) lo = mid;
      else hi = mid;
    }
    return ((lo + hi) / 2) as Curvilinear;
  }

  arcLength(a: Curvilinear, b: Curvilinear): number {
    if (b <= a) return 0;
    const steps = ARC_LENGTH_SAMPLES;
    const h = (b - a) / steps;
    let sum = this.getDerivative(a).length() + this.getDerivative(b).length();
    for (let i = 1; i < steps; i++) {
      const t = (a + i * h) as Curvilinear;
      sum += (i % 2 === 1 ? 4 : 2) * this.getDerivative(t).length();
    }
    return (sum * h) / 3;
  }

  getUniformCoordFromCurvilinear(s: Curvilinear): number {
    if (s <= 0) return 0;
    if (s >= 1) return this.length;
    const n = this.uniformCoordinates.length;
    if (n === 0) return 0;
    // Shared with the module-level ds: the LUT is built with this step by
    // updateLength, so the inverse map cannot silently desynchronize from it.
    const pos = s / ds;
    const i0 = Math.min(n - 1, Math.floor(pos));
    const i1 = Math.min(n - 1, i0 + 1);
    const u0 = this.uniformCoordinates[i0] ?? 0;
    const u1 = this.uniformCoordinates[i1] ?? this.length;
    return u0 + (u1 - u0) * (pos - i0);
  }

  getPosition(s: Curvilinear): Vector<2> {
    const r = 1 - s;
    return this.p0
      .times(r ** 3)
      .plus(this.p1.times(3 * r ** 2 * s))
      .plus(this.p2.times(3 * r * s ** 2))
      .plus(this.p3.times(s ** 3));
  }

  getDerivative(s: Curvilinear): Vector<2> {
    const r = 1 - s;
    const subValue1 = this.p1.minus(this.p0);
    const subValue2 = this.p2.minus(this.p1);
    const subValue3 = this.p3.minus(this.p2);

    return subValue1
      .times(3 * r ** 2)
      .plus(subValue2.times(6 * r * s))
      .plus(subValue3.times(3 * s ** 2));
  }

  getSecondDerivative(s: Curvilinear): Vector<2> {
    const r = 1 - s;
    const subValue1 = this.p2.minus(this.p1.times(2)).plus(this.p0);
    const subValue2 = this.p3.minus(this.p2.times(2)).plus(this.p1);

    return subValue1.times(6 * r).plus(subValue2.times(6 * s));
  }

  getCurvature(s: Curvilinear): number {
    const d1 = this.getDerivative(s);
    const d2 = this.getSecondDerivative(s);
    const speed = d1.length();
    if (speed === 0) return 0;
    return (d1.x * d2.y - d1.y * d2.x) / speed ** 3;
  }

  /**
   * Inflection parameters t of the cubic, where the signed curvature changes sign.
   *
   * The curvature numerator x'(t)y''(t) − y'(t)x''(t) is at most quadratic in t:
   *
   *   cross(t) = 18 · ( A + (B − A)·t + C·t² )
   *   A = (P1−P0) × (P2−2P1+P0)
   *   B = (P1−P0) × (P3−2P2+P1)
   *   C = (P2−2P1+P0) × (P3−2P2+P1)
   *
   * Returns the roots strictly inside (0, 1), ascending. Degenerate cases:
   * |C| ≈ 0 gives a linear numerator (single root, only when A·B < 0);
   * a zero discriminant is a zero-curvature touch, not a sign change;
   * roots where the first derivative is nearly zero are cusps, not inflections.
   */
  getInflections(): Curvilinear[] {
    const q0 = this.p1.minus(this.p0);
    const r0 = this.p2.minus(this.p1.times(2)).plus(this.p0);
    const r1 = this.p3.minus(this.p2.times(2)).plus(this.p1);
    const cross = (a: Vector<2>, v: Vector<2>): number => a.x * v.y - a.y * v.x;
    const A = cross(q0, r0);
    const B = cross(q0, r1);
    const C = cross(r0, r1);

    const eps = 1e-12;
    const scale = Math.max(Math.abs(A), Math.abs(B), Math.abs(C), 1);
    const roots: Curvilinear[] = [];

    // Curvature is undefined where the first derivative is nearly zero (cusp),
    // so such roots are not inflection points.
    const isRegular = (t: number): boolean => this.getDerivative(t as Curvilinear).length() > eps * scale;

    if (Math.abs(C) <= eps * scale) {
      const denom = B - A;
      if (Math.abs(denom) > eps * scale) {
        const t = A / (A - B);
        if (A * B < 0 && t > eps && t < 1 - eps && isRegular(t)) roots.push(t as Curvilinear);
      }
    } else {
      const b = B - A;
      const discriminant = b * b - 4 * C * A;
      if (discriminant > 0) {
        const root = Math.sqrt(discriminant);
        // Numerically stable pairing (the product of the roots is A/C).
        const q = -0.5 * (b + Math.sign(b || 1) * root);
        const candidates = q !== 0 ? [q / C, A / q] : [];
        for (const t of candidates) {
          if (t > eps && t < 1 - eps && isRegular(t)) roots.push(t as Curvilinear);
        }
      }
    }
    return roots.sort((a, b) => a - b);
  }

  isPointInBoundingBox(point: Vector<2>, tolerance = 0): boolean {
    const xs = [this.p0.x, this.p1.x, this.p2.x, this.p3.x];
    const ys = [this.p0.y, this.p1.y, this.p2.y, this.p3.y];
    const minX = Math.min(...xs) - tolerance;
    const maxX = Math.max(...xs) + tolerance;
    const minY = Math.min(...ys) - tolerance;
    const maxY = Math.max(...ys) + tolerance;
    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  }

  intersectsRect(rect: AxisRect, tolerance = 0): boolean {
    const xs = [this.p0.x, this.p1.x, this.p2.x, this.p3.x];
    const ys = [this.p0.y, this.p1.y, this.p2.y, this.p3.y];
    const minX = Math.min(...xs) - tolerance;
    const maxX = Math.max(...xs) + tolerance;
    const minY = Math.min(...ys) - tolerance;
    const maxY = Math.max(...ys) + tolerance;
    return minX <= rect.maxX && maxX >= rect.minX && minY <= rect.maxY && maxY >= rect.minY;
  }

  getClosestPoint(point: Vector<2>): { t: Curvilinear; point: Vector<2>; distance: number } {
    const control = [this.p0, this.p1, this.p2, this.p3] as Vector<2>[];

    const w = convertToBezierForm(point, control);
    const tCandidates = new Array<number>(W_DEGREE);
    const nSolutions = findRoots(w, W_DEGREE, tCandidates, 0);

    let bestT = 0 as Curvilinear;
    let bestSquared = point.minus(this.p0).lengthSquared();

    const update = (t: number) => {
      const clamped = Math.min(1, Math.max(0, t));
      const candidate = this.getPosition(clamped as Curvilinear);
      const squared = point.minus(candidate).lengthSquared();
      if (squared < bestSquared) {
        bestSquared = squared;
        bestT = clamped as Curvilinear;
      }
    };

    for (let i = 0; i < nSolutions; i++) {
      update(tCandidates[i]!);
    }

    update(1);

    return {
      t: bestT,
      point: this.getPosition(bestT),
      distance: Math.sqrt(bestSquared),
    };
  }

  alignStart(c: Curve, length?: number) {
    if (this.p0 != c.p3) {
      this.p0 = c.p3;
    }

    let dir = c.p3.minus(c.p2);
    if (dir.lengthSquared() == 0) return;
    dir = dir.normalized();

    const dist = length ?? this.p1.minus(this.p0).length();
    if (dist == 0) return;

    this.p1 = this.p0.plus(dir.times(dist));
  }

  alignEnd(c: Curve, length?: number) {
    if (this.p3 != c.p0) {
      this.p3 = c.p0;
    }

    let dir = c.p0.minus(c.p1);
    if (dir.lengthSquared() == 0) return;
    dir = dir.normalized();

    const dist = length ?? this.p3.minus(this.p2).length();
    if (dist == 0) return;

    this.p2 = this.p3.plus(dir.times(dist));
  }

  draw(ctx: CanvasRenderingContext2DSized) {
    if (ctx == null) return;
    ctx.beginPath();
    ctx.moveTo(this.p0.x, -this.p0.y);
    ctx.bezierCurveTo(this.p1.x, -this.p1.y, this.p2.x, -this.p2.y, this.p3.x, -this.p3.y);
    ctx.stroke();
  }

  static intersecting(d0: Vector<2>, d1: Vector<2>, d2: Vector<2>, d3: Vector<2>): Curve {
    return new Curve(
      d0,
      d0
        .times(-5 / 6)
        .plus(d1.times(18 / 6))
        .plus(d2.times(-9 / 6))
        .plus(d3.times(2 / 6)),
      d0
        .times(2 / 6)
        .plus(d1.times(-9 / 6))
        .plus(d2.times(18 / 6))
        .plus(d3.times(-5 / 6)),
      d3,
    );
  }

  cut(x: Curvilinear): [Curve, Curve] {
    const px = this.getPosition(x);

    const dx = this.getDerivative(x).times(1 / 3);
    const common = Math.min(x, 1 - x);
    const handleLength = dx.length() * common;
    const direction = dx.normalized();
    const c2 = px.minus(direction.times(handleLength));
    const c3 = px.plus(direction.times(handleLength));

    return [new Curve(this.p0, this.p1, c2, px), new Curve(px, c3, this.p2, this.p3)];
  }
}

const DEGREE = 3;
const W_DEGREE = 5; // degree of the squared-distance polynomial
const MAXDEPTH = 64; // maximum recursion depth
const EPSILON = Math.pow(2, -(MAXDEPTH + 1)); // flatness threshold for a root bracket

type BezierPoint = Vector<2>;

function convertToBezierForm(P: BezierPoint, V: BezierPoint[]): BezierPoint[] {
  // precomputed "z" distribution table for cubics
  const z = [
    [1.0, 0.6, 0.3, 0.1],
    [0.4, 0.6, 0.6, 0.4],
    [0.1, 0.3, 0.6, 1.0],
  ];

  const c: BezierPoint[] = V.map((v) => v.minus(P));
  const d: BezierPoint[] = [];
  for (let i = 0; i < DEGREE; i++) {
    d.push(V[i + 1]!.minus(V[i]!).times(3));
  }

  const cdTable: number[][] = [];
  for (let row = 0; row < DEGREE; row++) {
    cdTable[row] = [];
    for (let column = 0; column <= DEGREE; column++) {
      cdTable[row]![column] = d[row]!.dot(c[column]!);
    }
  }

  const w: BezierPoint[] = [];
  for (let i = 0; i <= W_DEGREE; i++) {
    w.push(new Vector<2>(i / W_DEGREE, 0));
  }

  const n = DEGREE;
  const m = DEGREE - 1;
  for (let k = 0; k <= n + m; k++) {
    const lb = Math.max(0, k - m);
    const ub = Math.min(k, n);
    for (let i = lb; i <= ub; i++) {
      const j = k - i;
      w[i + j]!.y += cdTable[j]![i]! * z[j]![i]!;
    }
  }

  return w;
}

function findRoots(w: BezierPoint[], degree: number, t: number[], depth: number): number {
  const crossings = crossingCount(w, degree);

  if (crossings === 0) {
    return 0;
  }

  if (crossings === 1) {
    if (depth >= MAXDEPTH) {
      t[0] = (w[0]!.x + w[W_DEGREE]!.x) / 2;
      return 1;
    }
    if (controlPolygonFlatEnough(w, degree)) {
      t[0] = computeXIntercept(w, degree);
      return 1;
    }
  }

  const [left, right] = bezierSplit(w, degree, 0.5);
  const leftT = new Array<number>(W_DEGREE);
  const rightT = new Array<number>(W_DEGREE);
  const leftCount = findRoots(left, degree, leftT, depth + 1);
  const rightCount = findRoots(right, degree, rightT, depth + 1);

  let count = 0;
  for (let i = 0; i < leftCount; i++) t[count++] = leftT[i]!;
  for (let i = 0; i < rightCount; i++) t[count++] = rightT[i]!;
  return count;
}

function crossingCount(V: BezierPoint[], degree: number): number {
  let nCrossings = 0;
  let oldSign = signOf(V[0]!.y);
  for (let i = 1; i <= degree; i++) {
    const sign = signOf(V[i]!.y);
    if (sign != oldSign) nCrossings++;
    oldSign = sign;
  }
  return nCrossings;
}

function signOf(x: number): number {
  return x < 0 ? -1 : x > 0 ? 1 : 0;
}

function controlPolygonFlatEnough(V: BezierPoint[], degree: number): boolean {
  const a = V[0]!.y - V[degree]!.y;
  const b = V[degree]!.x - V[0]!.x;
  const c = V[0]!.x * V[degree]!.y - V[degree]!.x * V[0]!.y;

  let maxDistanceAbove = 0;
  let maxDistanceBelow = 0;
  for (let i = 1; i < degree; i++) {
    const value = a * V[i]!.x + b * V[i]!.y + c;
    if (value > maxDistanceAbove) maxDistanceAbove = value;
    else if (value < maxDistanceBelow) maxDistanceBelow = value;
  }

  const a1 = 0;
  const b1 = 1;
  const c1 = 0;

  const intercept1 = lineIntersectX(a1, b1, c1, a, b, c - maxDistanceAbove);
  const intercept2 = lineIntersectX(a1, b1, c1, a, b, c - maxDistanceBelow);
  if (intercept1 == null || intercept2 == null) return false;

  const left = Math.min(intercept1, intercept2);
  const right = Math.max(intercept1, intercept2);
  return right - left < EPSILON;
}

function lineIntersectX(a1: number, b1: number, c1: number, a2: number, b2: number, c2: number): number | null {
  const det = a1 * b2 - a2 * b1;
  if (det === 0) return null;
  const dInv = 1 / det;
  return (b1 * c2 - b2 * c1) * dInv;
}

function computeXIntercept(V: BezierPoint[], degree: number): number {
  const xNm = V[degree]!.x - V[0]!.x;
  const yNm = V[degree]!.y - V[0]!.y;
  const xMk = V[0]!.x;
  const yMk = V[0]!.y;

  const det = -yNm;
  const detInv = 1 / det;
  const s = (xNm * yMk - yNm * xMk) * detInv;
  return s;
}

function bezierSplit(V: BezierPoint[], degree: number, t: number): [BezierPoint[], BezierPoint[]] {
  const Vtemp: BezierPoint[][] = [];
  for (let j = 0; j <= degree; j++) {
    (Vtemp[0] ??= [])[j] = V[j]!.copy();
  }

  for (let i = 1; i <= degree; i++) {
    for (let j = 0; j <= degree - i; j++) {
      (Vtemp[i] ??= [])[j] = Vtemp[i - 1]![j]!.times(1 - t).plus(Vtemp[i - 1]![j + 1]!.times(t));
    }
  }

  const left: BezierPoint[] = [];
  const right: BezierPoint[] = [];
  for (let j = 0; j <= degree; j++) {
    left.push(Vtemp[j]![0]!.copy());
    right.push(Vtemp[degree - j]![j]!.copy());
  }

  return [left, right];
}
