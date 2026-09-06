import type { CanvasRenderingContext2DSized } from "./rinkCanvas.js";
import { Vector } from "./vector.js";

export type Curvilinear = number & { readonly __tag: unique symbol };

/** Curvilinear increment for length estimation */
const ds = 0.05 as Curvilinear;
/** Number of integration steps per curve used for accurate arc-length lookup. */
const ARC_LENGTH_SAMPLES = 256;

export class Curve {
  p0: Vector<2>;
  p1: Vector<2>;
  p2: Vector<2>;
  p3: Vector<2>;
  // Useful for conversion between curvilinear and uniform coordinates
  uniformCoordinates: number[];
  length: number;

  /** Cubic Bezier curve, to desrcibe path of foot/body center
   * 0--(1)-(2)--3
   * @param p0 - Starting point
   * @param p1 - First control point
   * @param p2 - Second control point
   * @param p3 - Ending point
   */
  constructor(p0: Vector<2>, p1: Vector<2>, p2: Vector<2>, p3: Vector<2>) {
    this.p0 = p0;
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;

    this.uniformCoordinates = [];
    this.length = 0;
    this.updateLength();
  }

  /** Serialize to a plain JSON object. */
  toJSON(): { p0: { data: number[] }; p1: { data: number[] }; p2: { data: number[] }; p3: { data: number[] } } {
    return { p0: this.p0.toJSON(), p1: this.p1.toJSON(), p2: this.p2.toJSON(), p3: this.p3.toJSON() };
  }

  /** Reconstruct a Curve from serialized data. */
  static fromJSON(json: {
    p0: { data: number[] };
    p1: { data: number[] };
    p2: { data: number[] };
    p3: { data: number[] };
  }): Curve {
    return new Curve(
      Vector.fromJSON(json.p0) as Vector<2>,
      Vector.fromJSON(json.p1) as Vector<2>,
      Vector.fromJSON(json.p2) as Vector<2>,
      Vector.fromJSON(json.p3) as Vector<2>,
    );
  }

  updateLength() {
    this.length = 0;
    this.uniformCoordinates = [0]; // Cumulated length

    for (let s = 0 as Curvilinear; s < 1; s = (s + ds) as Curvilinear) {
      // Have correct increment for last segment
      const dsCorrected = Math.min(ds, 1 - s);

      const derivative = this.getDerivative(s);
      const dl = derivative.length() * dsCorrected;

      this.length += dl;
      this.uniformCoordinates.push(this.length);
    }
  }

  /** @param u - Uniform coordinate, from 0 to curve length */
  getCurvilinearCoordFromUniform(u: number): Curvilinear {
    if (u >= this.length) return 1 as Curvilinear;

    // Find which interval contains u
    const upper = this.uniformCoordinates.findIndex((x: number) => x > u);
    if (upper <= 0) return 0 as Curvilinear; // Defensive: should not occur for u in [0, length)

    const lower = upper - 1;
    const uUpper = this.uniformCoordinates[upper]!;
    const uLower = this.uniformCoordinates[lower]!;
    const sUpper = Math.min(upper * ds, 1);
    const sLower = lower * ds;

    return (((u - uLower) / (uUpper - uLower)) * (sUpper - sLower) + sLower) as Curvilinear;
  }

  /**
   * Curvilinear coordinate at which the curve has reached half of its real
   * arc length. The arc length is integrated at a fine resolution (unlike the
   * coarse `uniformCoordinates` sampling used by `getCurvilinearCoordFromUniform`),
   * then a binary search finds the parameter whose covered length equals half
   * the total, so the result is accurate even for strongly non-uniform curves.
   */
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

  /** Arc length of the curve between the curvilinear coordinates `a` and `b`. */
  private arcLength(a: Curvilinear, b: Curvilinear): number {
    const steps = ARC_LENGTH_SAMPLES;
    const dt = (b - a) / steps;
    let sum = 0;
    for (let i = 0; i < steps; i++) {
      sum += this.getDerivative((a + dt * i) as Curvilinear).length() * dt;
    }
    return sum;
  }

  /** @param s - Curvilinear coordinate */
  getPosition(s: Curvilinear): Vector<2> {
    const r = 1 - s;
    return this.p0
      .times(r ** 3)
      .plus(this.p1.times(3 * r ** 2 * s))
      .plus(this.p2.times(3 * r * s ** 2))
      .plus(this.p3.times(s ** 3));
  }

  /** @param s - Curvilinear coordinate */
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

  /** @param s - Curvilinear coordinate */
  getSecondDerivative(s: Curvilinear): Vector<2> {
    const r = 1 - s;
    const subValue1 = this.p2.minus(this.p1.times(2)).plus(this.p0);
    const subValue2 = this.p3.minus(this.p2.times(2)).plus(this.p1);

    return subValue1.times(6 * r).plus(subValue2.times(6 * s));
  }

  /**
   * Whether a point lies inside the axis-aligned bounding box that encloses
   * all four control points, expanded by a tolerance on every side.
   *
   * This is a fast rejection test used to filter out curves that cannot be
   * close to the point (a Bezier curve is always contained in the bounding
   * box of its control points).
   *
   * @param point - The point to test.
   * @param tolerance - Extra margin around the box, in the same units as the point.
   */
  isPointInBoundingBox(point: Vector<2>, tolerance = 0): boolean {
    const xs = [this.p0.x, this.p1.x, this.p2.x, this.p3.x];
    const ys = [this.p0.y, this.p1.y, this.p2.y, this.p3.y];
    const minX = Math.min(...xs) - tolerance;
    const maxX = Math.max(...xs) + tolerance;
    const minY = Math.min(...ys) - tolerance;
    const maxY = Math.max(...ys) + tolerance;
    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  }

  /**
   * The point on this cubic Bezier curve closest to a given point.
   *
   * The squared distance from the query point is a 5th-degree polynomial in
   * the curve parameter. Its stationary points (roots of the derivative) and
   * the two curve endpoints are the only candidates for the minimum, so they
   * are computed and the closest one is kept. This follows the classic
   * Graphics Gems approach (Schneider, "Nearest-Point-on-Curve Problem").
   *
   * @param point - The query point.
   * @returns The parameter at the closest point, the closest point itself,
   *          and the distance between the query point and the curve.
   */
  getClosestPoint(point: Vector<2>): { t: Curvilinear; point: Vector<2>; distance: number } {
    // Control points of this curve, in the order expected by the algorithm.
    const control = [this.p0, this.p1, this.p2, this.p3] as Vector<2>[];

    // Convert the problem to a 5th-degree Bezier form whose roots are the
    // stationary points of the squared distance.
    const w = convertToBezierForm(point, control);
    const tCandidates = new Array<number>(W_DEGREE);
    const nSolutions = findRoots(w, W_DEGREE, tCandidates, 0);

    // Start from t = 0 and compare every root candidate with it.
    let bestT = 0 as Curvilinear;
    let bestSquared = point.minus(this.p0).lengthSquared();

    const update = (t: number) => {
      // Clamp to the segment: a candidate slightly outside [0, 1] (or a root
      // found just past an endpoint) must never extrapolate off the curve.
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

    // Finally compare with the end of the curve, t = 1.
    update(1);

    return {
      t: bestT,
      point: this.getPosition(bestT),
      distance: Math.sqrt(bestSquared),
    };
  }

  /** Move first endpoint and control point to align with preceeding curve
   * @param c - Preceeding curve
   */
  alignStart(c: Curve) {
    if (this.p0 != c.p3) {
      this.p0 = c.p3; // Common endpoint
    }

    // Compute target direction
    let dir = c.p3.minus(c.p2);
    if (dir.lengthSquared() == 0) return; // No direction to match
    dir = dir.normalized();

    // Compute p0-p1 distance, which will be conserved
    const dist = this.p1.minus(this.p0).length();
    if (dist == 0) return;

    this.p1 = this.p0.plus(dir.times(dist));
  }

  /** Move last endpoint and control point to align with following curve
   * @param c - Following curve
   */
  alignEnd(c: Curve) {
    if (this.p3 != c.p0) {
      this.p3 = c.p0; // Common endpoint
    }

    // Compute target direction
    let dir = c.p0.minus(c.p1);
    if (dir.lengthSquared() == 0) return; // No direction to match
    dir = dir.normalized();

    // Compute p2-p3 distance, which will be conserved
    const dist = this.p3.minus(this.p2).length();
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

  /** Creates a new Curve passing through specified points.
   * The points are matched at curvilinear coordinates 0, 1/3, 2/3, and 1. */
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

  /** Creates two new curves from t = 0 to x and from x to 1.
   *  @param x - Curvilinear coordinate
   */
  cut(x: Curvilinear): [Curve, Curve] {
    // Cutpoint
    const px = this.getPosition(x);

    // Scaled derivatives
    const d0 = this.getDerivative(0 as Curvilinear).times(1 / 3);
    const dx = this.getDerivative(x).times(1 / 3);
    const d3 = this.getDerivative(1 as Curvilinear).times(1 / 3);

    // Control points
    const c1 = this.p0.plus(d0.times(x));
    const c2 = px.minus(dx.times(x));
    const c3 = px.plus(dx.times(1 - x));
    const c4 = this.p3.minus(d3.times(1 - x));

    return [new Curve(this.p0, c1, c2, px), new Curve(px, c3, c4, this.p3)];
  }
}

// -------------------------------------------------------------------------
// Closest-point-on-curve algorithm
// -------------------------------------------------------------------------
// Port of the classic "Graphics Gems" solver by Philip J. Schneider
// ("Solving the Nearest-Point-on-Curve Problem", 1990). The squared distance
// to a cubic Bezier is a 5th-degree polynomial in the curve parameter, so the
// problem is converted to a 5th-degree Bezier form and its roots are isolated
// by recursively subdividing the control polygon until each root is bracketed
// by a flat enough segment. This avoids any fixed sampling density.

/** Degree of the cubic Bezier curve. */
const DEGREE = 3;
/** Degree of the squared-distance polynomial. */
const W_DEGREE = 5;
/** Maximum recursion depth for root finding. */
const MAXDEPTH = 64;
/** Flatness threshold: the width of the bracket that is considered a root. */
const EPSILON = Math.pow(2, -(MAXDEPTH + 1));

type BezierPoint = Vector<2>;

/** Build the control points of the 5th-degree squared-distance equation. */
function convertToBezierForm(P: BezierPoint, V: BezierPoint[]): BezierPoint[] {
  // Precomputed "z" for cubics (dot-product distribution over the skew diagonal).
  const z = [
    [1.0, 0.6, 0.3, 0.1],
    [0.4, 0.6, 0.6, 0.4],
    [0.1, 0.3, 0.6, 1.0],
  ];

  // c[i] = V[i] - P
  const c: BezierPoint[] = V.map((v) => v.minus(P));
  // d[i] = 3 * (V[i+1] - V[i])
  const d: BezierPoint[] = [];
  for (let i = 0; i < DEGREE; i++) {
    d.push(V[i + 1]!.minus(V[i]!).times(3));
  }

  // Dot products of c and d.
  const cdTable: number[][] = [];
  for (let row = 0; row < DEGREE; row++) {
    cdTable[row] = [];
    for (let column = 0; column <= DEGREE; column++) {
      cdTable[row]![column] = d[row]!.dot(c[column]!);
    }
  }

  // The x coordinates set the parameter values, the y coordinate accumulates
  // the polynomial value at that parameter.
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

/**
 * Find all roots of a Bezier-form polynomial in [0, 1].
 * Returns the number of roots found and writes them to `t`.
 */
function findRoots(w: BezierPoint[], degree: number, t: number[], depth: number): number {
  const crossings = crossingCount(w, degree);

  if (crossings === 0) {
    return 0; // No root in this interval.
  }

  if (crossings === 1) {
    // Unique root: stop when the tree is deep enough or the segment is flat.
    if (depth >= MAXDEPTH) {
      t[0] = (w[0]!.x + w[W_DEGREE]!.x) / 2;
      return 1;
    }
    if (controlPolygonFlatEnough(w, degree)) {
      t[0] = computeXIntercept(w, degree);
      return 1;
    }
  }

  // Otherwise subdivide and solve the two halves recursively.
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

/** Count sign changes of the polynomial over its control points (lower bound on roots). */
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

/**
 * Whether the control polygon is flat enough that its chord is a good enough
 * approximation of the curve to extract the root. Uses the corrected version
 * by James Walker of the original Graphics Gems implementation.
 */
function controlPolygonFlatEnough(V: BezierPoint[], degree: number): boolean {
  // Implicit equation of the line through the first and last control points:
  // a*x + b*y + c = 0
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

  // Implicit equation of a horizontal line (y = 0).
  const a1 = 0;
  const b1 = 1;
  const c1 = 0;

  // Bracket the polynomial roots with the "above" and "below" lines.
  const intercept1 = lineIntersectX(a1, b1, c1, a, b, c - maxDistanceAbove);
  const intercept2 = lineIntersectX(a1, b1, c1, a, b, c - maxDistanceBelow);
  if (intercept1 == null || intercept2 == null) return false;

  const left = Math.min(intercept1, intercept2);
  const right = Math.max(intercept1, intercept2);
  return right - left < EPSILON;
}

/** x coordinate where two implicit lines (a*x + b*y + c = 0) intersect, or null if parallel. */
function lineIntersectX(a1: number, b1: number, c1: number, a2: number, b2: number, c2: number): number | null {
  const det = a1 * b2 - a2 * b1;
  if (det === 0) return null; // Parallel lines: no unique intercept.
  const dInv = 1 / det;
  return (b1 * c2 - b2 * c1) * dInv;
}

/** x where the chord between the first and last control points crosses y = 0. */
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

/**
 * Evaluate a Bezier-form polynomial and split it into left and right halves
 * using de Casteljau's algorithm at parameter `t`.
 */
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
