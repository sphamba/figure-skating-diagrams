import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import { Path } from "../src/engine/path.js";
import { Sequence } from "../src/engine/sequence.js";
import {
  LeftBackwardOpenMohawk,
  LeftForwardClosedMohawk,
  LeftForwardOpenMohawk,
  RightForwardOpenMohawk,
  mohawkKindChoices,
} from "../src/engine/element/mohawk.js";
import {
  LeftBackwardClosedChoctaw,
  LeftForwardClosedChoctaw,
  LeftForwardOpenChoctaw,
  RightBackwardOpenChoctaw,
  choctawKindChoices,
} from "../src/engine/element/choctaw.js";
import { changeElementType } from "../src/engine/element/turnTypes.js";
import { halfFeetSpacing } from "../src/engine/element/glide.js";
import { isTurnElement, checkSequenceCurvatures } from "../src/engine/sequenceEditor/curvatureWarning.js";
import { getQuaternionFromAngleAxis, Quaternion } from "../src/engine/quaternion.js";
import { Vector } from "../src/engine/vector.js";

const start = 0.25 as PathCoordinate;
const end = 0.75 as PathCoordinate;
const spacing = halfFeetSpacing;

// The angle property of a quaternion is 2*acos(real) and loses the rotation sign.
function signedAngle(quaternion: Quaternion): number {
  return 2 * Math.atan2(quaternion.vector.z, quaternion.real);
}

function worldOffset(position: Vector<3>, angle: number): Vector<2> {
  return position.rotate(getQuaternionFromAngleAxis(angle)) as unknown as Vector<2>;
}

test("Mohawk and choctaw variants have types and short names", () => {
  const mohawk = new LeftForwardOpenMohawk("footL", start, end);
  expect(mohawk.type).toBe("LeftForwardOpenMohawk");
  expect(mohawk.shortName).toBe("MO");

  const closedMohawk = new LeftForwardClosedMohawk("footL", start, end);
  expect(closedMohawk.shortName).toBe("MO");

  const openChoctaw = new RightBackwardOpenChoctaw("footR", start, end);
  expect(openChoctaw.type).toBe("RightBackwardOpenChoctaw");
  expect(openChoctaw.shortName).toBe("opCHO");

  const closedChoctaw = new LeftBackwardClosedChoctaw("footL", start, end);
  expect(closedChoctaw.type).toBe("LeftBackwardClosedChoctaw");
  expect(closedChoctaw.shortName).toBe("clCHO");
});

test("A mohawk keeps the contact point at the middle of both feet", () => {
  const mohawk = new LeftForwardOpenMohawk("footL", start, end);
  for (const keyframe of [...mohawk.getLeftFootKeyframes(), ...mohawk.getRightFootKeyframes()]) {
    expect(keyframe.data.contactPoint).toBe(0.5);
  }
});

test("A left forward open mohawk places both feet on the path line at the midpoint", () => {
  const mohawk = new LeftForwardOpenMohawk("footL", start, end);
  const footA = mohawk.getLeftFootKeyframes();
  const footB = mohawk.getRightFootKeyframes();

  expect(footA).toHaveLength(3);
  expect(footB).toHaveLength(3);
  expect(footA[0]!.coordinate).toBe(start);
  expect(footA[1]!.coordinate).toBe(0.5 as PathCoordinate);
  expect(footA[2]!.coordinate).toBe(end);

  // Start: foot A on ice, foot B off ice
  const onIce = footA[0]!.data.position!;
  expect(onIce.x).toBe(0);
  expect(onIce.y).toBe(0);
  expect(onIce.z).toBe(0);
  const freeFoot = footB[0]!.data.position!;
  expect(freeFoot.z).toBeCloseTo(0.2, 5);
  expect(footB[0]!.data.orientation!.angle).toBeCloseTo(0, 10);

  // Midpoint: foot A ahead on the path line, foot B behind, 90 degrees apart
  const footAMid = worldOffset(footA[1]!.data.position!, signedAngle(footA[1]!.data.orientation!));
  const footBMid = worldOffset(footB[1]!.data.position!, signedAngle(footB[1]!.data.orientation!));
  expect(footAMid.x).toBeCloseTo(spacing, 10);
  expect(footAMid.y).toBeCloseTo(0, 10);
  expect(footBMid.x).toBeCloseTo(-spacing, 10);
  expect(footBMid.y).toBeCloseTo(0, 10);
  expect(footA[1]!.data.orientation!.angle).toBeCloseTo(0, 10);
  const footBOrientation = footB[1]!.data.orientation!;
  expect(footBOrientation.angle).toBeCloseTo(Math.PI / 2, 10);
  expect(footBOrientation.vector.z).toBeLessThan(0);
  expect(footA[1]!.data.position!.z).toBe(0);
  expect(footB[1]!.data.position!.z).toBe(0);

  // End: foot A off ice, foot B on ice pointing backward
  expect(footA[2]!.data.position!.z).toBeCloseTo(0.2, 5);
  const footBEnd = footB[2]!.data.position!;
  expect(footBEnd.x).toBe(0);
  expect(footBEnd.y).toBe(0);
  expect(footBEnd.z).toBe(0);
  expect(footB[2]!.data.orientation!.angle).toBeCloseTo(Math.PI, 10);

  // Hips rotate clockwise by 90 degrees at the midpoint and 180 at the end
  const hips = mohawk.getHipsKeyframes();
  expect(hips).toHaveLength(3);
  expect(hips[0]!.coordinate).toBe(start);
  expect(hips[1]!.coordinate).toBe(0.5 as PathCoordinate);
  expect(hips[2]!.coordinate).toBe(end);
  expect(hips[0]!.data.orientation!.angle).toBeCloseTo(0, 10);
  expect(hips[1]!.data.orientation!.angle).toBeCloseTo(Math.PI / 2, 10);
  expect(hips[1]!.data.orientation!.vector.z).toBeLessThan(0);
  expect(hips[2]!.data.orientation!.angle).toBeCloseTo(Math.PI, 10);
  expect(hips[2]!.data.orientation!.vector.z).toBeLessThan(0);
});

test("A right forward mohawk rotates opposite to a left forward mohawk", () => {
  const mohawk = new RightForwardOpenMohawk("footR", start, end);
  const footA = mohawk.getRightFootKeyframes();
  const footB = mohawk.getLeftFootKeyframes();

  const footAMid = worldOffset(footA[1]!.data.position!, signedAngle(footA[1]!.data.orientation!));
  const footBMid = worldOffset(footB[1]!.data.position!, signedAngle(footB[1]!.data.orientation!));
  expect(footAMid.x).toBeCloseTo(spacing, 10);
  expect(footBMid.x).toBeCloseTo(-spacing, 10);
  const footBOrientation = footB[1]!.data.orientation!;
  expect(footBOrientation.angle).toBeCloseTo(Math.PI / 2, 10);
  expect(footBOrientation.vector.z).toBeGreaterThan(0);

  const hips = mohawk.getHipsKeyframes();
  expect(hips[1]!.data.orientation!.angle).toBeCloseTo(Math.PI / 2, 10);
  expect(hips[1]!.data.orientation!.vector.z).toBeGreaterThan(0);
  expect(hips[2]!.data.orientation!.angle).toBeCloseTo(Math.PI, 10);
  expect(hips[2]!.data.orientation!.vector.z).toBeGreaterThan(0);
});

test("An open choctaw places foot B behind foot A at the midpoint", () => {
  const choctaw = new LeftForwardOpenChoctaw("footL", start, end);
  const footA = choctaw.getLeftFootKeyframes();
  const footB = choctaw.getRightFootKeyframes();

  expect(footA).toHaveLength(3);
  expect(footB).toHaveLength(3);
  const footAMid = worldOffset(footA[1]!.data.position!, signedAngle(footA[1]!.data.orientation!));
  const footBMid = worldOffset(footB[1]!.data.position!, signedAngle(footB[1]!.data.orientation!));
  expect(footAMid.x).toBeCloseTo(spacing, 10);
  expect(footAMid.y).toBeCloseTo(0, 10);
  expect(footBMid.x).toBeCloseTo(-spacing, 10);
  expect(footBMid.y).toBeCloseTo(0, 10);
  expect(footA[1]!.data.orientation!.angle).toBeCloseTo(0, 10);
  expect(footB[1]!.data.orientation!.angle).toBeCloseTo(Math.PI, 10);
  expect(footA[1]!.data.position!.z).toBe(0);
  expect(footB[1]!.data.position!.z).toBe(0);
});

test("A closed choctaw places foot B in front of foot A at the midpoint", () => {
  const choctaw = new LeftForwardClosedChoctaw("footL", start, end);
  const footA = choctaw.getLeftFootKeyframes();
  const footB = choctaw.getRightFootKeyframes();

  const footAMid = worldOffset(footA[1]!.data.position!, signedAngle(footA[1]!.data.orientation!));
  const footBMid = worldOffset(footB[1]!.data.position!, signedAngle(footB[1]!.data.orientation!));
  expect(footAMid.x).toBeCloseTo(-spacing, 10);
  expect(footBMid.x).toBeCloseTo(spacing, 10);
  expect(footA[1]!.data.orientation!.angle).toBeCloseTo(0, 10);
  expect(footB[1]!.data.orientation!.angle).toBeCloseTo(Math.PI, 10);
});

test("A backward choctaw keeps the same midpoint foot placement rule", () => {
  const choctaw = new LeftBackwardClosedChoctaw("footL", start, end);
  const footA = choctaw.getLeftFootKeyframes();
  const footB = choctaw.getRightFootKeyframes();

  const footAMid = worldOffset(footA[1]!.data.position!, signedAngle(footA[1]!.data.orientation!));
  const footBMid = worldOffset(footB[1]!.data.position!, signedAngle(footB[1]!.data.orientation!));
  expect(footAMid.x).toBeCloseTo(spacing, 10);
  expect(footBMid.x).toBeCloseTo(-spacing, 10);
  expect(footA[1]!.data.orientation!.angle).toBeCloseTo(Math.PI, 10);
  // Foot B points forward (the opposite of foot A): an identity rotation.
  expect(Math.abs(footB[1]!.data.orientation!.real)).toBeCloseTo(1, 10);

  const hips = choctaw.getHipsKeyframes();
  expect(hips[0]!.data.orientation!.angle).toBeCloseTo(Math.PI, 10);
  expect(hips[1]!.data.orientation!.angle).toBeCloseTo((3 * Math.PI) / 2, 10);
  expect(hips[1]!.data.orientation!.vector.z).toBeGreaterThan(0);
  expect(hips[2]!.data.orientation!.angle).toBeCloseTo(2 * Math.PI, 10);
  expect(hips[2]!.data.orientation!.vector.z).toBeGreaterThan(0);
});

test("A backward mohawk places the entry foot behind and the free foot ahead at the midpoint", () => {
  const mohawk = new LeftBackwardOpenMohawk("footL", start, end);
  const footA = mohawk.getLeftFootKeyframes();
  const footB = mohawk.getRightFootKeyframes();

  const footAMid = worldOffset(footA[1]!.data.position!, signedAngle(footA[1]!.data.orientation!));
  const footBMid = worldOffset(footB[1]!.data.position!, signedAngle(footB[1]!.data.orientation!));
  expect(footAMid.x).toBeCloseTo(spacing, 10);
  expect(footAMid.y).toBeCloseTo(0, 10);
  expect(footBMid.x).toBeCloseTo(-spacing, 10);
  expect(footBMid.y).toBeCloseTo(0, 10);
  const footBOrientation = footB[1]!.data.orientation!;
  expect(footBOrientation.angle).toBeCloseTo((3 * Math.PI) / 2, 10);
  expect(footBOrientation.vector.z).toBeGreaterThan(0);

  const hips = mohawk.getHipsKeyframes();
  expect(hips[0]!.data.orientation!.angle).toBeCloseTo(Math.PI, 10);
  expect(hips[1]!.data.orientation!.angle).toBeCloseTo((3 * Math.PI) / 2, 10);
  expect(hips[1]!.data.orientation!.vector.z).toBeGreaterThan(0);
  expect(hips[2]!.data.orientation!.angle).toBeCloseTo(2 * Math.PI, 10);
  expect(hips[2]!.data.orientation!.vector.z).toBeGreaterThan(0);
});

test("Mohawk and choctaw modules list eight variants each", () => {
  expect(mohawkKindChoices).toHaveLength(8);
  expect(choctawKindChoices).toHaveLength(8);
  for (const choice of [...mohawkKindChoices, ...choctawKindChoices]) {
    expect(/Open|Closed(Mohawk|Choctaw)$/.test(choice.type)).toBe(true);
  }
});

test("Two feet turns give keyframes to both foot layers", () => {
  const path = new Path();
  const sequence = new Sequence(path);
  const mohawk = new RightForwardOpenMohawk("footL", start, end);
  sequence.addElement(mohawk);

  expect(sequence.keyframes.footL).toHaveLength(3);
  expect(sequence.keyframes.footR).toHaveLength(3);
  expect(sequence.keyframes.hips).toHaveLength(3);
});

test("Two feet turns have no curvature checks", () => {
  const path = new Path();
  const sequence = new Sequence(path);
  const mohawk = new LeftForwardOpenMohawk("footL", start, end);
  const choctaw = new LeftForwardClosedChoctaw("footL", start, end);
  expect(isTurnElement(mohawk)).toBe(false);
  expect(isTurnElement(choctaw)).toBe(false);
  sequence.addElement(mohawk);
  sequence.addElement(choctaw);
  expect(checkSequenceCurvatures(sequence)).toEqual([]);
});

test("changeElementType instantiates mohawk and choctaw types", () => {
  const mohawk = changeElementType("RightForwardClosedMohawk", { type: "RightForwardClosedMohawk", start, end });
  expect(mohawk.type).toBe("RightForwardClosedMohawk");
  expect(mohawk.shortName).toBe("MO");
  const choctaw = changeElementType("LeftBackwardOpenChoctaw", { type: "LeftBackwardOpenChoctaw", start, end });
  expect(choctaw.type).toBe("LeftBackwardOpenChoctaw");
  expect(choctaw.toJSON()).toMatchObject({ type: "LeftBackwardOpenChoctaw", start, end });
});
