import type { CanvasRenderingContext2DSized } from "./rinkCanvas.js";
import { Vector } from "./vector.js";

export type Curvilinear = number & { readonly __tag: unique symbol };

/** Curvilinear increment for length estimation */
const ds = 0.05 as Curvilinear;

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
