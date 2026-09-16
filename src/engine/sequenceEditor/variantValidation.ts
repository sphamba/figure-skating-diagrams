import { bladeLength } from "../constants.js";
import type { PathCoordinate } from "../coordinates.js";
import type { Element } from "../element/element.js";
import type { FootKey } from "../sequence.js";
import { Sequence } from "../sequence.js";
import { Vector } from "../vector.js";
import type { Path } from "../path.js";
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

// Computed valid variant values of a one-foot glide or stroke after the foot is
// selected. The direction comes from the state entering the element, the same
// way as for turns; the edge comes from the path curvature at the element's
// end, unlike turns which read it at the start. A null value cannot be
// inferred at that position, so no flag check is shown for it.
export type OneFootVariantValidity = {
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

// The direction matches the getWorldForwardDirection construction used by the
// trace drawing: the toe lies along the local positive x axis, rotated by the
// interpolated foot then the path frame.
function footPointsForward(sequence: Sequence, footKey: FootKey, u: PathCoordinate): boolean {
  const footDirectionWorld = sequence.getWorldForwardDirection(footKey, u);
  const tangent = sequence.path.getDerivative(u).normalized();
  return tangent.x * footDirectionWorld.x + tangent.y * footDirectionWorld.y > 0;
}

// The path position of the state entering an element: the end of the element
// before it, or its own start when there is no predecessor. A provisional
// element is not part of sequence.elements, so its predecessor is the last
// element that ends at or before its start.
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

function clampU(path: Path) {
  return (u: number) => Math.max(0, Math.min(path.length, u)) as PathCoordinate;
}

// The path position of the state entering an element, the end of the element
// before it or the element start itself.
function enteringU(sequence: Sequence, element: Element, path: Path): PathCoordinate {
  const clamp = clampU(path);
  const predecessor = previousElementOf(sequence, element);
  return predecessor ? clamp(predecessor.end as number) : clamp(element.start as number);
}

// The edge that the path curvature implies for this foot and direction; a
// straight path implies none.
function impliedEdge(footKey: FootKey, forward: boolean, u: PathCoordinate, path: Path): boolean | null {
  const [curve, curvilinear] = path.getCurveAndCurvilinearCoord(u);
  const curvatureSign = Math.sign(curve.getCurvature(curvilinear));
  if (curvatureSign === 0) return null;
  const left = footKey === "footL";
  return (curvatureSign === -1) === forward ? left : !left;
}

export function checkTurnVariantValidity(sequence: Sequence, element: Element): TurnVariantValidity {
  const unknown: TurnVariantValidity = { left: null, forward: null, inside: null };
  const path = sequence.path;
  if (path.curves.length === 0) return unknown;

  const enteringState = enteringU(sequence, element, path);
  const onIceFeet = FOOT_KEYS.filter(
    (footKey) => hasTraceData(sequence, footKey) && isFootOnIce(sequence, footKey, enteringState),
  );
  if (onIceFeet.length !== 1) return unknown;

  const footKey = onIceFeet[0]!;
  const left = footKey === "footL";
  const forward = footPointsForward(sequence, footKey, enteringState);
  const inside = impliedEdge(footKey, forward, clampU(path)(element.start as number), path);

  return { left, forward, inside };
}

export function checkOneFootVariantValidity(
  sequence: Sequence,
  element: Element,
  footKey: FootKey,
): OneFootVariantValidity {
  const unknown: OneFootVariantValidity = { forward: null, inside: null };
  const path = sequence.path;
  if (path.curves.length === 0 || !hasTraceData(sequence, footKey)) return unknown;

  const forward = footPointsForward(sequence, footKey, enteringU(sequence, element, path));
  const inside = impliedEdge(footKey, forward, clampU(path)(element.end as number), path);
  return { forward, inside };
}
