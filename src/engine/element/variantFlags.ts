// Parses element type names into the flags shared by each element kind, for the
// dialog to highlight the values of an existing element.
export type VariantFlags = {
  twoFoot?: boolean;
  side?: "Left" | "Right";
  direction?: "Forward" | "Backward";
  edge?: "Inside" | "Outside" | "Neither";
  stroke?: "Normal" | "Crossed" | "CrossedBack";
  group?: "ThreeTurn" | "Bracket" | "Rocker" | "Counter" | "Loop" | "Twizzle" | "Mohawk" | "Choctaw";
  openness?: "Open" | "Closed"; // two-feet turns only
  turns?: string; // twizzle turn count as string, e.g. "1.5"
};

const STROKE_NAMES = ["CrossedBack", "Crossed", "Normal"] as const; // longest first
const TURN_GROUPS = ["ThreeTurn", "Bracket", "Rocker", "Counter", "Loop"] as const;
const TWO_FEET_GROUPS = ["Mohawk", "Choctaw"] as const;

type Side = "Left" | "Right";
type Direction = "Forward" | "Backward";

function parseSide(type: string): [Side | undefined, string] {
  if (type.startsWith("Left")) return ["Left", type.slice(4)];
  if (type.startsWith("Right")) return ["Right", type.slice(5)];
  return [undefined, type];
}

function parseDirection(base: string): [Direction | undefined, string] {
  if (base.startsWith("Forward")) return ["Forward", base.slice(7)];
  if (base.startsWith("Backward")) return ["Backward", base.slice(8)];
  return [undefined, base];
}

function parseEdge(base: string): ["Inside" | "Outside" | "Neither", string] {
  if (base.startsWith("Inside")) return ["Inside", base.slice(6)];
  if (base.startsWith("Outside")) return ["Outside", base.slice(7)];
  return ["Neither", base];
}

export function parseVariantFlags(type: string): VariantFlags {
  if (type.startsWith("Both")) {
    const [direction] = parseDirection(type.slice(4));
    return direction ? { twoFoot: true, direction } : { twoFoot: true };
  }

  const [side, rest] = parseSide(type);
  const flags: VariantFlags = side ? { side } : {};

  if (rest.endsWith("Glide")) {
    let base = rest.slice(0, -"Glide".length);
    const stroke = STROKE_NAMES.find((name) => base.startsWith(name));
    if (stroke) {
      flags.stroke = stroke;
      base = base.slice(stroke.length);
    }
    const [direction, afterDirection] = parseDirection(base);
    if (direction) {
      flags.direction = direction;
      flags.edge = parseEdge(afterDirection)[0];
    }
    return flags;
  }

  const twizzleMatch = rest.match(/^(.*?)(?:Twizzle)([0-9.]+)$/);
  if (twizzleMatch && side) {
    const [direction, afterDirection] = parseDirection(twizzleMatch[1]!);
    const edge = parseEdge(afterDirection)[0];
    if (direction && edge !== "Neither") {
      flags.direction = direction;
      flags.edge = edge;
      flags.group = "Twizzle";
      flags.turns = twizzleMatch[2]!;
    }
    return flags;
  }

  const turnGroup = TURN_GROUPS.find((suffix) => rest.endsWith(suffix));
  if (turnGroup) {
    const [direction, afterDirection] = parseDirection(rest.slice(0, -turnGroup.length));
    const edge = parseEdge(afterDirection)[0];
    if (direction && edge !== "Neither") {
      flags.direction = direction;
      flags.edge = edge;
      flags.group = turnGroup;
    }
    return flags;
  }

  const twoFeetGroup = TWO_FEET_GROUPS.find((suffix) => rest.endsWith(suffix));
  if (twoFeetGroup) {
    const [direction, afterDirection] = parseDirection(rest.slice(0, -twoFeetGroup.length));
    if (direction) {
      flags.group = twoFeetGroup;
      flags.direction = direction;
      flags.openness = afterDirection === "Open" ? "Open" : afterDirection === "Closed" ? "Closed" : undefined;
    }
  }
  return flags;
}
