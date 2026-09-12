import { bladeLength } from "../constants.js";
import type { PathCoordinate } from "../coordinates.js";
import type { Element } from "../element/element.js";
import type { FootKey } from "../sequence.js";
import { Sequence } from "../sequence.js";
import { Vector } from "../vector.js";
import type { Quaternion } from "../quaternion.js";

// Computed valid variant values for a turn element. The foot and direction
// come from the end of the previous element, the state entering this element;
// the edge comes from the path curvature at this element's start. A null value
// cannot be inferred at that position, so no flag check is shown for it.
export type TurnVariantValidity = {
  left: boolean | null;
  forward: boolean | null;
  inside: boolean | null;
};

const FOOT_KEYS: FootKey[] = ["footL", "footR"];

// Same hasData logic as the foot trace drawing: a foot only has usable data
// when position, orientation, and contactPoint all appear in its keyframes.
function hasTraceData(sequence: Sequence, footKey: FootKey): boolean {
  const keyframes = sequence.keyframes[footKey];
  return (
    keyframes.some((keyframe) => keyframe.data.position !== undefined) &&
    keyframes.some((keyframe) => keyframe.data.orientation !== undefined) &&
    keyframes.some((keyframe) => keyframe.data.contactPoint !== undefined)
  );
}

// Mirrors the on-ground test of the foot trace drawing: the contact point of
// the blade rests on the ice when its rotated z coordinate is not above 0.
function isFootOnIce(sequence: Sequence, footKey: FootKey, u: PathCoordinate): boolean {
  const contactPoint = sequence.getInterpolatedValue(footKey, "contactPoint", u) as number;
  const relativeOrientation = sequence.getInterpolatedValue(footKey, "orientation", u) as Quaternion;
  const relativePosition = sequence.getInterpolatedValue(footKey, "position", u) as Vector<3>;
  const footOrientation = relativeOrientation.times(sequence.getPathOrientation(u));
  const contactRelative = relativePosition.copy();
  contactRelative.x += (contactPoint - 0.5) * bladeLength;
  const contactRotated = contactRelative.rotate(footOrientation);
  return contactRotated.z <= 0;
}

// Mirrors the trace drawing construction of the blade direction: the toe lies
// along the local positive x axis, rotated by the foot then the path frame.
function footPointsForward(sequence: Sequence, footKey: FootKey, u: PathCoordinate): boolean {
  const relativeOrientation = sequence.getInterpolatedValue(footKey, "orientation", u) as Quaternion;
  const footDirection = new Vector<3>(1, 0, 0).rotate(relativeOrientation);
  const footDirectionWorld = footDirection.rotate(sequence.getPathOrientation(u));
  const tangent = sequence.path.getDerivative(u).normalized();
  return tangent.x * footDirectionWorld.x + tangent.y * footDirectionWorld.y > 0;
}

// The element immediately before this one, sorted by start then end, the same
// sort approach as nextElementAfter in editor.ts. A provisional element is not
// part of sequence.elements, so its predecessor is the last element that ends
// at or before its start.
export function previousElementOf(sequence: Sequence, element: Element): Element | null {
  const sorted = [...sequence.elements].sort(
    (a, b) => (a.start as number) - (b.start as number) || (a.end as number) - (b.end as number),
  );
  const index = sorted.indexOf(element);
  if (index > 0) return sorted[index - 1]!;
  const before = sorted.filter(
    (other) => Math.max(other.start as number, other.end as number) <= (element.start as number),
  );
  return before[before.length - 1] ?? null;
}

export function checkTurnVariantValidity(sequence: Sequence, element: Element): TurnVariantValidity {
  const unknown: TurnVariantValidity = { left: null, forward: null, inside: null };
  const path = sequence.path;
  if (path.curves.length === 0) return unknown;

  const clamp = (u: number) => Math.max(0, Math.min(path.length, u)) as PathCoordinate;
  const predecessor = previousElementOf(sequence, element);
  const enteringU = predecessor ? clamp(predecessor.end as number) : clamp(element.start as number);
  const onIceFeet = FOOT_KEYS.filter(
    (footKey) => hasTraceData(sequence, footKey) && isFootOnIce(sequence, footKey, enteringU),
  );
  if (onIceFeet.length !== 1) return unknown;

  const footKey = onIceFeet[0]!;
  const left = footKey === "footL";
  const forward = footPointsForward(sequence, footKey, enteringU);

  // Curvature/edge sign relation, shared with the curvature warning: a turn is
  // clockwise when (left === inside) === forward, and a clockwise path has a
  // negative curvature sign. Solving for inside gives the edge the path
  // curvature implies for this foot and direction; a straight path implies none.
  const spanU = clamp(element.start as number);
  const [curve, curvilinear] = path.getCurveAndCurvilinearCoord(spanU);
  const curvatureSign = Math.sign(curve.getCurvature(curvilinear));
  const inside = curvatureSign === 0 ? null : (curvatureSign === -1) === forward ? left : !left;

  return { left, forward, inside };
}
