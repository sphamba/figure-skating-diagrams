import { bladeLength } from "../constants.js";
import type { PathCoordinate } from "../coordinates.js";
import { FootKeyframe, type FootData, HipsKeyframe } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import { OneFootTurn } from "./oneFootTurn.js";
import type { FootKey } from "../sequence.js";

export type LoopConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => Loop;

const defaultLoopShift = (bladeLength * 1.5) as PathCoordinate; // keeps the loop length at 1.5 x bladeLength

export abstract class Loop extends OneFootTurn {
  protected get initialAngle(): number {
    return this.forward ? 0 : Math.PI;
  }

  protected get angleIncrement(): number {
    return this.clockwise ? -Math.PI : Math.PI;
  }

  protected get contactPointTurn(): number {
    return this.forward ? 0 : 1;
  }

  protected createHipsKeyframes(start: PathCoordinate, end: PathCoordinate): HipsKeyframe[] {
    const pathCoordinate = ((start + end) / 2) as PathCoordinate;
    const coordinates = [start, pathCoordinate, end];

    const keyframes: HipsKeyframe[] = [];
    for (let i = 0; i < 3; i++) {
      const angle = this.initialAngle + i * this.angleIncrement;
      const keyframeData = {
        position: new Vector<3>(0, 0, 0),
        orientation: getQuaternionFromAngleAxis(angle),
      };

      const keyframe = new HipsKeyframe(
        coordinates[i]!,
        keyframeData,
        i != 1 ? "smooth" : "linear",
        i != 1 ? "smooth" : "linear",
      );
      keyframes.push(keyframe);
    }
    return keyframes;
  }

  createOnIceFootKeyframes(start: PathCoordinate, end: PathCoordinate, lateralScale?: number): FootKeyframe[] {
    const pathCoordinate = ((start + end) / 2) as PathCoordinate;
    const scale = lateralScale ?? 1;
    const lateralShift = (this.clockwise ? 1 : -1) * (this.forward ? 1 : -1) * defaultLoopShift * scale;
    const pathLengthEntry = (pathCoordinate - start) as PathCoordinate;
    const pathLengthExit = (end - pathCoordinate) as PathCoordinate;
    const pathCoordinateShifts = [-pathLengthEntry, 0, pathLengthExit];
    const pathCoordinates = pathCoordinateShifts.map(
      (pathCoordinateShift) => (pathCoordinate + pathCoordinateShift) as PathCoordinate,
    );
    const contactPoints = [0.5, this.contactPointTurn, 0.5];
    const positions = [
      new Vector<3>(0, 0, 0),
      new Vector<3>((0.5 - this.contactPointTurn) * bladeLength, lateralShift, 0),
      new Vector<3>(0, 0, 0),
    ];

    const keyframes: FootKeyframe[] = [];
    for (let i = 0; i < 3; i++) {
      const pathCoordinate = pathCoordinates[i]!;
      const angle = this.initialAngle + i * this.angleIncrement;
      const contactPoint = contactPoints[i];

      const keyframeData: FootData = {
        orientation: getQuaternionFromAngleAxis(angle),
        contactPoint: contactPoint,
        position: positions[i],
      };

      const keyframe = new FootKeyframe(
        pathCoordinate,
        keyframeData,
        i != 1 ? "smooth" : "linear",
        i != 1 ? "smooth" : "linear",
      );

      keyframes.push(keyframe);
    }
    return keyframes;
  }
}

export const loopConstructorsByType: Record<string, LoopConstructor> = {};

function defineLoop(
  type: string,
  shortName: string,
  flags: { left: boolean; forward: boolean; inside: boolean },
): LoopConstructor {
  const Variant = class extends Loop {
    constructor(footKey: FootKey, start: PathCoordinate, end: PathCoordinate) {
      super(footKey, flags, start, end);
    }

    get type(): string {
      return type;
    }

    get shortName(): string {
      return shortName;
    }
  };
  loopConstructorsByType[type] = Variant;
  return Variant;
}

const turnSides = [
  ["Left", true],
  ["Right", false],
] as const;
const turnDirections = [
  ["Forward", true],
  ["Backward", false],
] as const;
const turnEdges = [
  ["Inside", true],
  ["Outside", false],
] as const;

export const loopKindChoices: { type: string; label: string }[] = [];

for (const [side, left] of turnSides) {
  for (const [direction, forward] of turnDirections) {
    for (const [edge, inside] of turnEdges) {
      const type = `${side}${direction}${edge}Loop`;
      const shortName = `${side[0]}${direction[0]}${edge[0]} Loop`;
      defineLoop(type, shortName, { left, forward, inside });
      loopKindChoices.push({ type, label: `${side} ${direction.toLowerCase()} ${edge.toLowerCase()} loop` });
    }
  }
}

export const LeftForwardInsideLoop = loopConstructorsByType["LeftForwardInsideLoop"]!;
export const LeftForwardOutsideLoop = loopConstructorsByType["LeftForwardOutsideLoop"]!;
export const LeftBackwardInsideLoop = loopConstructorsByType["LeftBackwardInsideLoop"]!;
export const LeftBackwardOutsideLoop = loopConstructorsByType["LeftBackwardOutsideLoop"]!;
export const RightForwardInsideLoop = loopConstructorsByType["RightForwardInsideLoop"]!;
export const RightForwardOutsideLoop = loopConstructorsByType["RightForwardOutsideLoop"]!;
export const RightBackwardInsideLoop = loopConstructorsByType["RightBackwardInsideLoop"]!;
export const RightBackwardOutsideLoop = loopConstructorsByType["RightBackwardOutsideLoop"]!;
