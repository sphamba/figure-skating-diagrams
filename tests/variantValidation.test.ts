import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { Vector, getUnitVectorFromAngle } from "../src/engine/vector";
import { getQuaternionFromAngleAxis } from "../src/engine/quaternion";
import { FootKeyframe } from "../src/engine/keyframe";
import { LeftForwardInsideThreeTurn, LeftForwardOutsideThreeTurn, LeftBackwardInsideThreeTurn } from "../src/engine/element/threeTurn";
import { LeftForwardOpenMohawk } from "../src/engine/element/mohawk";
import { glideConstructorsByType, LeftForwardInsideGlide } from "../src/engine/element/glide";
import { checkTurnVariantValidity } from "../src/engine/sequenceEditor/variantValidation";

function getArcCurve(center: Vector<2>, radius: number, startAngle: number, endAngle: number): Curve {
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

function clockwisePath(): Path {
  const path = new Path();
  const radius = 5;
  path.addCurveEnd(getArcCurve(new Vector(0, -radius), radius, (3 * Math.PI) / 2, Math.PI / 2));
  return path;
}

function counterclockwisePath(): Path {
  const path = new Path();
  const radius = 5;
  path.addCurveEnd(getArcCurve(new Vector(0, radius), radius, -Math.PI / 2, Math.PI / 2));
  return path;
}

test("a forward inside left turn on a clockwise path computes left, forward, inside valid", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const element = new LeftForwardInsideThreeTurn(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(element);

  expect(checkTurnVariantValidity(sequence, element)).toEqual({ left: true, forward: true, inside: true });
});

test("a forward outside left turn on a clockwise path computes the curvature-implied edge", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const element = new LeftForwardOutsideThreeTurn(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(element);

  // The stated edge (Outside) differs from the path curvature: on a clockwise
  // path the curvature implies the inside edge for a left forward turn.
  expect(checkTurnVariantValidity(sequence, element)).toEqual({ left: true, forward: true, inside: true });
});

test("a backward inside left turn on a counterclockwise path computes a backward orientation", () => {
  const path = counterclockwisePath();
  const sequence = new Sequence(path);
  const element = new LeftBackwardInsideThreeTurn(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(element);

  expect(checkTurnVariantValidity(sequence, element)).toEqual({ left: true, forward: false, inside: true });
});

test("a forward left mohawk on a clockwise path computes its two-feet turn start flags", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const element = new LeftForwardOpenMohawk(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(element);

  expect(checkTurnVariantValidity(sequence, element)).toEqual({ left: true, forward: true, inside: true });
});

test("a sequence without element keyframes computes no valid flags", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const element = new LeftForwardInsideThreeTurn(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );

  expect(checkTurnVariantValidity(sequence, element)).toEqual({ left: null, forward: null, inside: null });
});

test("two feet on ice at the element start compute no valid flags", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const element = new LeftForwardInsideThreeTurn(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );

  const onIce = { position: new Vector<3>(0, 0, 0), orientation: getQuaternionFromAngleAxis(0), contactPoint: 0.5 };
  for (const footKey of ["footL", "footR"] as const) {
    for (const coordinate of [element.start, ((element.start + element.end) / 2) as PathCoordinate, element.end]) {
      sequence.keyframes[footKey].push(
        new FootKeyframe(coordinate as PathCoordinate, onIce, "linear", "linear"),
      );
    }
  }

  expect(checkTurnVariantValidity(sequence, element)).toEqual({ left: null, forward: null, inside: null });
});

test("a path with no curves computes no valid flags", () => {
  const sequence = new Sequence(new Path());
  const element = new LeftForwardInsideThreeTurn("footL", 0 as PathCoordinate, 1 as PathCoordinate);

  expect(checkTurnVariantValidity(sequence, element)).toEqual({ left: null, forward: null, inside: null });
});

test("the foot and direction come from the end of the previous element", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const glide = new (glideConstructorsByType["RightForwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => LeftForwardInsideGlide)(path.length * 0.1, path.length * 0.3);
  const turn = new LeftForwardInsideThreeTurn(
    "footL",
    (path.length * 0.5) as PathCoordinate,
    (path.length * 0.9) as PathCoordinate,
  );
  sequence.addElement(glide);
  sequence.addElement(turn);

  // At the glide end the right foot is on ice and the toe follows the tangent;
  // the curvature at the turn start (clockwise arc) with left=false,
  // forward=true implies the outside edge.
  expect(checkTurnVariantValidity(sequence, turn)).toEqual({ left: false, forward: true, inside: false });
});

test("a provisional element probes the last element before its start", () => {
  const path = clockwisePath();
  const sequence = new Sequence(path);
  const previous = new LeftForwardInsideThreeTurn(
    "footL",
    (path.length / 4) as PathCoordinate,
    ((3 * path.length) / 4) as PathCoordinate,
  );
  sequence.addElement(previous);

  // Not added to the sequence, like a provisional element. The previous turn
  // ends going backward, and the curvature at the provisional start with
  // left=true, forward=false implies the outside edge.
  const provisional = new LeftForwardInsideThreeTurn(
    "footL",
    (path.length * 0.9) as PathCoordinate,
    (path.length) as PathCoordinate,
  );
  expect(checkTurnVariantValidity(sequence, provisional)).toEqual({ left: true, forward: false, inside: false });
});
