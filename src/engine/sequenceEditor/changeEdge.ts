import type { Curve, Curvilinear } from "../curve.js";
import type { PathCoordinate } from "../coordinates.js";
import type { DynamicGlide } from "../element/stroke.js";
import type { Sequence } from "../sequence.js";

export const CHANGE_EDGE_LABEL = "CE";

// The crossed pill text: XB for a crossed backward stroke, XS when the stroke
// crosses a change of edge, XF for the remaining crossed forward strokes.
export function crossedStrokeLabel(sequence: Sequence, element: DynamicGlide): string | null {
  const backward = !element.forward;
  if (element.crossedBack) {
    return backward && strokeCrossesEdgeChange(sequence, element) ? "XS" : "XB";
  }
  if (backward) return "XF";
  return strokeCrossesEdgeChange(sequence, element) ? "XS" : null;
}

function strokeCrossesEdgeChange(sequence: Sequence, element: DynamicGlide): boolean {
  const path = sequence.path;
  const [startCurve, startU] = path.getCurveAndCurvilinearCoord(element.start);
  const [endCurve, endU] = path.getCurveAndCurvilinearCoord(element.end);
  return startCurve.getCurvature(startU) * endCurve.getCurvature(endU) < 0;
}

// The change-of-edge path coordinates that no element span covers: the curve
// inflections and the curvature sign changes at curve joints.
export function uncoveredChangeEdgeCoordinates(sequence: Sequence): PathCoordinate[] {
  const curves = sequence.path.curves;
  const pathCoordinates: PathCoordinate[] = [];
  curves.forEach((curve, curveIndex) => {
    for (const inflection of curve.getInflections()) {
      const u = uniformCoordinateAt(curves, curveIndex, inflection) as PathCoordinate;
      if (!isInsideElementSpan(sequence, u)) pathCoordinates.push(u);
    }
  });
  for (let i = 0; i + 1 < curves.length; i++) {
    const before = curves[i]!.getCurvature(1 as Curvilinear);
    const after = curves[i + 1]!.getCurvature(0 as Curvilinear);
    if (before * after >= 0) continue; // zero curvature counts as no sign change
    const u = uniformCoordinateAt(curves, i, 1 as Curvilinear) as PathCoordinate;
    if (!isInsideElementSpan(sequence, u)) pathCoordinates.push(u);
  }
  return pathCoordinates;
}

// The uniform path coordinate of the curvilinear parameter s within a curve.
export function uniformCoordinateAt(curves: Curve[], curveIndex: number, s: number): number {
  let u = 0;
  for (let i = 0; i < curveIndex; i++) u += curves[i]!.length;
  return u + curves[curveIndex]!.getUniformCoordFromCurvilinear(s as Curvilinear);
}

function isInsideElementSpan(sequence: Sequence, u: PathCoordinate): boolean {
  return sequence.elements.some((element) => {
    const lo = Math.min(element.start as number, element.end as number);
    const hi = Math.max(element.start as number, element.end as number);
    return (u as number) >= lo && (u as number) <= hi;
  });
}
