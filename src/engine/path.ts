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
    this.length = this.curves.reduce((sum, curve) => sum + curve.length, 0);
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

  /** Create 1m straight curve aligned with end of Path (or at center of rink if Path empty).*/
  createNewEndCurve(): Curve {
    const lastCurve = this.curves[this.curves.length - 1];
    let p0: Vector<2>;
    let dir: Vector<2>;

    if (this.curves.length == 0) {
      // 1m straight line at center of rink
      p0 = new Vector<2>(0, -0.5);
      dir = new Vector<2>(0, 1);
    } else {
      // Take last point of chain and keep direction
      p0 = lastCurve!.p3;
      dir = lastCurve!.getDerivative(1 as Curvilinear).normalized();
    }

    return new Curve(p0, p0.plus(dir.times(1 / 3)), p0.plus(dir.times(2 / 3)), p0.plus(dir)); // 1m straight line
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

  /** Create 1m straight curve aligned with start of Path (or at center of rink if Path empty).*/
  createNewStartCurve(): Curve {
    const firstCurve = this.curves[0];
    let p0: Vector<2>;
    let dir: Vector<2>;

    if (this.curves.length == 0) {
      // 1m straight line at center of rink
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

    return new Curve(p0, p0.plus(dir.times(1 / 3)), p0.plus(dir.times(2 / 3)), p0.plus(dir)); // 1m straight line
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

    // Create new Path to find intermediate positions easily
    const subPath = new Path();
    subPath.addCurveEnd(curveBefore);
    subPath.addCurveEnd(curveAfter);

    // Create new curve
    const curve = Curve.intersecting(
      subPath.getPosition(0 as PathCoordinate),
      subPath.getPosition(((1 / 3) * subPath.length) as PathCoordinate),
      subPath.getPosition(((2 / 3) * subPath.length) as PathCoordinate),
      subPath.getPosition((1 * subPath.length) as PathCoordinate),
    );

    // Remaining curves
    const curvesBefore = this.curves.slice(0, this.curves.indexOf(curveBefore));
    const curvesAfter = this.curves.slice(this.curves.indexOf(curveAfter) + 1);

    // Match endpoints
    if (curvesBefore.length > 0) {
      curve.p0 = curvesBefore[curvesBefore.length - 1]!.p3;
    }
    if (curvesAfter.length > 0) {
      curve.p3 = curvesAfter[0]!.p0;
    }

    // Replace curveBefore and curveAfter in array by curve
    this.curves = [...curvesBefore, curve, ...curvesAfter];
    this.updateLength();
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

  /** @param uStart - Uniform path coordinate where to start drawing, from 0 to path length. Defaults to 0.
   *   @param uEnd - Uniform path coordinate where to end drawing, from 0 to path length. Defaults to path length. */
  draw(ctx: CanvasRenderingContext2DSized, _uStart: PathCoordinate = 0 as PathCoordinate, uEnd?: PathCoordinate) {
    uEnd ??= this.length as PathCoordinate;
    this.curves.forEach((curve) => curve.draw(ctx));
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
