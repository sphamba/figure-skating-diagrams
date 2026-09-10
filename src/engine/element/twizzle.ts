import type { PathCoordinate } from "../coordinates.js";
import type { FootKey } from "../sequence.js";
import { EdgeTurn, turnSides, turnDirections, turnEdges } from "./oneFootTurn.js";
import { FootKeyframe, type FootData } from "../keyframe.js";
import { getQuaternionFromAngleAxis } from "../quaternion.js";
import { Vector } from "../vector.js";
import type { FootTurnFlags } from "./turn.js";

export abstract class Twizzle extends EdgeTurn {
  readonly turns: number;

  constructor(footKey: FootKey, flags: FootTurnFlags, start: PathCoordinate, end: PathCoordinate, turns: number) {
    super(footKey, flags, start, end);
    if (!(Number.isInteger(turns * 2) && turns >= 0.5 && turns <= 5.5)) {
      throw new Error(`Twizzle turn count must be between 0.5 and 5.5 in 0.5 steps: ${turns}`);
    }
    this.turns = turns;
  }

  protected get counterRotated(): boolean {
    return false;
  }

  createOnIceFootKeyframes(start: PathCoordinate, end: PathCoordinate, _lateralScale?: number): FootKeyframe[] {
    // A twizzle is a row of successive three-turns glued together, one three-turn
    // per half revolution. One three-turn is 2 keyframe steps of angleIncrement,
    // so a twizzle of `turns` revolutions has 4 * turns + 1 keyframes.
    const keyframeCount = 4 * this.turns + 1;
    const keyframes: FootKeyframe[] = [];
    for (let i = 0; i < keyframeCount; i++) {
      const coordinate = (start + ((end - start) * i) / (keyframeCount - 1)) as PathCoordinate;
      const angle = this.initialAngle + i * this.angleIncrement;
      // The contact point dips to one end of the foot at each turn. The
      // travel direction swaps every half revolution, so the dips oscillate
      // between opposite ends of the foot.
      let contactPoint: number;
      if (i % 2 === 0) {
        contactPoint = 0.5;
      } else {
        const half = (i - 1) / 2;
        const reverseEnd = half % 2 === 1;
        contactPoint = reverseEnd ? 1 - this.contactPointTurn : this.contactPointTurn;
      }

      const keyframeData: FootData = {
        position: new Vector<3>(0, 0, 0),
        orientation: getQuaternionFromAngleAxis(angle),
        contactPoint: contactPoint,
      };

      const keyframe = new FootKeyframe(
        coordinate,
        keyframeData,
        i === keyframeCount - 1 ? "smooth" : "linear",
        i === 0 ? "smooth" : "linear",
      );

      keyframes.push(keyframe);
    }
    return keyframes;
  }
}

export type TwizzleConstructor = new (footKey: FootKey, start: PathCoordinate, end: PathCoordinate) => Twizzle;

export const twizzleConstructorsByType: Record<string, TwizzleConstructor> = {};

export const twizzleTurns = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5];

function turnsNumeral(turns: number): string {
  const whole = Math.trunc(turns);
  const half = turns - whole === 0.5;
  if (whole === 0) {
    return "1/2";
  }
  return half ? `${whole}-1/2` : `${whole}`;
}

function turnsShortSuffix(turns: number): string {
  const numeral = turnsNumeral(turns);
  const half = !Number.isInteger(turns);
  return half ? `${numeral} TW` : `${numeral}TW`;
}

export const twizzleKindChoices: { type: string; label: string }[] = [];

for (const [side, left] of turnSides) {
  for (const [direction, forward] of turnDirections) {
    for (const [edge, inside] of turnEdges) {
      for (const turns of twizzleTurns) {
        const type = `${side}${direction}${edge}Twizzle${turns}`;
        const shortName = `${side[0]}${direction[0]}${edge[0]} ${turnsShortSuffix(turns)}`;
        const flags: FootTurnFlags = { left, forward, inside };
        const Variant = class extends Twizzle {
          constructor(footKey: FootKey, start: PathCoordinate, end: PathCoordinate) {
            super(footKey, flags, start, end, turns);
          }

          get type(): string {
            return type;
          }

          get shortName(): string {
            return shortName;
          }
        };
        twizzleConstructorsByType[type] = Variant;
        twizzleKindChoices.push({
          type,
          label: `${side} ${direction.toLowerCase()} ${edge.toLowerCase()} twizzle (${turnsNumeral(turns)} turn${turns === 0.5 || turns === 1 ? "" : "s"})`,
        });
      }
    }
  }
}
