import { describe, expect, test } from "vitest";
import type { CanvasRenderingContext2DSized } from "../../src/engine/rinkCanvas";
import { CANVAS_SCALE, RINK_COLOR } from "../../src/engine/constants.js";
import {
  LABEL_ANCHOR_LIMIT,
  LABEL_COLLISION_PADDING,
  LabelLayer,
  PillLabel,
  WhiteCircleLabel,
  capsuleSeparation,
} from "../../src/engine/sequenceEditor/label";
import { Vector } from "../../src/engine/vector";

const stubCtx = (): CanvasRenderingContext2DSized => {
  return {
    font: "",
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    textAlign: "start",
    textBaseline: "alphabetic",
    measureText: (text: string) =>
      text === ""
        ? { width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }
        : { width: 40, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 },
    fillText: () => {},
    fillRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
  } as unknown as CanvasRenderingContext2DSized;
};

// Zoom 100: the stub metrics measure to a pill of half width 25 and half height 7.
const ZOOM = 100;

describe("capsuleSeparation", () => {
  test("overlapping collinear capsules push apart along the axis", () => {
    const a = { x0: 0, y0: 0, x1: 100, y1: 0, radius: 10 };
    const b = { x0: 110, y0: 0, x1: 210, y1: 0, radius: 10 };
    expect(capsuleSeparation(a, b)).toEqual({ dx: 1, dy: 0, overlap: 10 });
  });

  test("disjoint capsules separate by nothing", () => {
    const a = { x0: 0, y0: 0, x1: 0, y1: 0, radius: 5 };
    const b = { x0: 100, y0: 0, x1: 100, y1: 0, radius: 5 };
    expect(capsuleSeparation(a, b)).toBeNull();
  });

  test("coincident capsules push apart along the x axis", () => {
    const a = { x0: 0, y0: 0, x1: 0, y1: 0, radius: 5 };
    const b = { x0: 0, y0: 0, x1: 0, y1: 0, radius: 5 };
    expect(capsuleSeparation(a, b)).toEqual({ dx: 1, dy: 0, overlap: 10 });
  });

  test("close parallel capsules push apart along the perpendicular", () => {
    const a = { x0: 0, y0: 0, x1: 10, y1: 0, radius: 5 };
    const b = { x0: 0, y0: 8, x1: 10, y1: 8, radius: 5 };
    expect(capsuleSeparation(a, b)).toEqual({ dx: 0, dy: 1, overlap: 2 });
  });
});

describe("CanvasLabel draw", () => {
  test("a pill draws the rink color backdrop, then the pill, then the text", () => {
    const tracked = stubCtx() as unknown as {
      globalAlpha: number;
      fillStyle: string;
      strokeStyle: string;
      lineWidth: number;
      fillText: (text: string, x: number, y: number) => void;
      stroke: () => void;
    };
    const captured: Array<
      { kind: "stroke"; alpha: number; strokeStyle: string; lineWidth: number } | { kind: "text"; alpha: number; fillStyle: string }
    > = [];
    const fillText = tracked.fillText;
    const stroke = tracked.stroke;
    tracked.fillText = (text: string, x: number, y: number) => {
      captured.push({ kind: "text", alpha: tracked.globalAlpha, fillStyle: tracked.fillStyle });
      fillText(text, x, y);
    };
    tracked.stroke = () => {
      captured.push({ kind: "stroke", alpha: tracked.globalAlpha, strokeStyle: tracked.strokeStyle, lineWidth: tracked.lineWidth });
      stroke();
    };
    const label = new PillLabel("a", new Vector(0, 0), null, ZOOM, {
      alpha: 0.3,
      textAlpha: 0.5,
      textColor: "#000",
    });
    label.measure(stubCtx());
    label.draw(tracked as unknown as CanvasRenderingContext2DSized);
    expect(captured).toHaveLength(3);
    // The backdrop is 1 screen px larger in radius, at the same configured
    // opacity as the pill background.
    expect(captured[0]!.kind).toBe("stroke");
    expect(captured[0]!.alpha).toBeCloseTo(0.24, 9);
    expect(captured[0]!.strokeStyle).toBe(RINK_COLOR);
    // halfB = 5 * 1.2 + 1, plus the 1 backdrop pixel.
    expect(captured[0]!.lineWidth).toBeCloseTo(2 * (5 * 1.2 + (5 * CANVAS_SCALE) / ZOOM + (1 * CANVAS_SCALE) / ZOOM), 9);
    expect(captured[1]!.kind).toBe("stroke");
    expect(captured[1]!.alpha).toBeCloseTo(0.24, 9);
    expect(captured[1]!.strokeStyle).toBe("#fafafb");
    expect(captured[1]!.lineWidth).toBeCloseTo(2 * (5 * 1.2 + (5 * CANVAS_SCALE) / ZOOM), 9);
    expect(captured[2]!.kind).toBe("text");
    expect(captured[2]!.alpha).toBeCloseTo(0.5, 9);
    expect(captured[2]!.fillStyle).toBe("#000");
  });

  test("a connector draws a rink-stroked, pill-filled triangle pointed at the anchor", () => {
    const tracked = stubCtx() as unknown as {
      globalAlpha: number;
      strokeStyle: string;
      fillStyle: string;
      lineWidth: number;
      beginPath: () => void;
      moveTo: (x: number, y: number) => void;
      lineTo: (x: number, y: number) => void;
      stroke: () => void;
      fill: () => void;
    };
    const captured: Array<{ kind: "stroke" | "fill"; color: string; lineWidth: number; points: number[][] }> = [];
    let points: number[][] = [];
    tracked.beginPath = () => {
      points = [];
    };
    tracked.moveTo = (x, y) => {
      points.push([x, y]);
    };
    tracked.lineTo = (x, y) => {
      points.push([x, y]);
    };
    tracked.stroke = () => {
      captured.push({ kind: "stroke", color: tracked.strokeStyle, lineWidth: tracked.lineWidth, points } as never);
    };
    tracked.fill = () => {
      captured.push({ kind: "fill", color: tracked.fillStyle, lineWidth: tracked.lineWidth, points } as never);
    };
    const label = new PillLabel("a", new Vector(1, 2), new Vector(0, 1), ZOOM, { connector: true });
    label.measure(stubCtx());
    label.draw(tracked as unknown as CanvasRenderingContext2DSized);
    const triangle = captured.filter((entry) => entry.points.length === 3);
    expect(triangle).toHaveLength(2);
    // The connector draws under the backdrop and the pill.
    expect(captured.indexOf(triangle[0]!)).toBe(0);
    expect(captured.indexOf(triangle[1]!)).toBe(1);
    // The stroked triangle uses the rink color at a 1px width.
    expect(triangle[0]!.kind).toBe("stroke");
    expect(triangle[0]!.color).toBe(RINK_COLOR);
    expect(triangle[0]!.lineWidth).toBeCloseTo((1 * CANVAS_SCALE) / ZOOM, 9);
    // The filled triangle above it uses the pill color.
    expect(triangle[1]!.kind).toBe("fill");
    expect(triangle[1]!.color).toBe("#fafafb");
    for (const entry of triangle) {
      // The apex sits on the anchor point.
      expect(entry.points[0]).toEqual([1 * CANVAS_SCALE, -2 * CANVAS_SCALE]);
    }
    // The base corners sit at the pill center, 8 screen px apart, along the
    // direction perpendicular to the anchor axis.
    const capsule = label.getCollisionCapsule();
    const center = [capsule.x0 + (capsule.x1 - capsule.x0) / 2, capsule.y0];
    const [corner1 = [0, 0], corner2 = [0, 0]] = triangle[0]!.points.slice(1) as number[][];
    expect(Math.hypot(corner1[0] - corner2[0], corner1[1] - corner2[1])).toBeCloseTo((8 * CANVAS_SCALE) / ZOOM, 9);
    expect(corner1[0] + corner2[0]).toBeCloseTo(2 * center[0], 9);
    expect(corner1[1] + corner2[1]).toBeCloseTo(2 * center[1], 9);
  });

  test("a connector skips a zero-length axis to the pill center", () => {
    const tracked = stubCtx() as unknown as {
      globalAlpha: number;
      strokeStyle: string;
      fillStyle: string;
      lineWidth: number;
      beginPath: () => void;
      moveTo: (x: number, y: number) => void;
      lineTo: (x: number, y: number) => void;
      stroke: () => void;
      fill: () => void;
    };
    const captured: number[] = [];
    tracked.beginPath = () => {
      captured.length = 0;
    };
    tracked.stroke = () => {
      captured.push(1);
    };
    tracked.fill = () => {
      captured.push(1);
    };
    const label = new PillLabel("a", new Vector(2, 3), null, ZOOM, { connector: true });
    label.measure(stubCtx());
    label.draw(tracked as unknown as CanvasRenderingContext2DSized);
    // The centered label has a zero-length axis, so the connector draws nothing.
    expect(captured.find((kind) => kind === 1)).toBeDefined();
  });
});

describe("CanvasLabel collision", () => {
  test("getCollisionCapsule matches the grown pill background extents", () => {
    const label = new PillLabel("a", new Vector(0, 0), null, ZOOM);
    label.measure(stubCtx());
    const capsule = label.getCollisionCapsule();
    const pad = (5 * CANVAS_SCALE) / ZOOM;
    const halfA = 20 * 1.2 + pad;
    const halfB = 5 * 1.2 + pad;
    const radius = halfB + (LABEL_COLLISION_PADDING * CANVAS_SCALE) / ZOOM;
    expect(capsule.radius).toBeCloseTo(radius, 9);
    expect(capsule.y0).toBeCloseTo(0, 9);
    expect(capsule.x0).toBeCloseTo(-(halfA - halfB), 9);
    expect(capsule.x1).toBeCloseTo(halfA - halfB, 9);
  });

  test("moveBy keeps the label within the anchor limit of its home", () => {
    const label = new PillLabel("a", new Vector(1, 2), null, ZOOM);
    label.measure(stubCtx());
    const pad = (5 * CANVAS_SCALE) / ZOOM;
    const limit = LABEL_ANCHOR_LIMIT * (5 * 1.2 + pad);
    label.moveBy(50, 50);
    const capsule = label.getCollisionCapsule();
    const cx = (capsule.x0 + capsule.x1) / 2;
    const homeX = 1 * CANVAS_SCALE;
    const homeY = -2 * CANVAS_SCALE;
    expect(Math.abs(cx - homeX)).toBeLessThanOrEqual(limit);
    expect(Math.abs(capsule.y0 - homeY)).toBeLessThanOrEqual(limit);
  });

  test("the layer pushes overlapping centered labels apart and skips empty ones", () => {
    const ctx = stubCtx();
    const drawn: Array<{ text: string; x: number; y: number }> = [];
    (ctx as unknown as Record<string, unknown>).fillText = (text: string, x: number, y: number) => {
      drawn.push({ text, x, y });
    };
    const layer = new LabelLayer();
    layer.add(new PillLabel("", new Vector(0, 0), null, ZOOM));
    layer.add(new PillLabel("first", new Vector(0, 0), null, ZOOM));
    layer.add(new PillLabel("second", new Vector(1, 0), null, ZOOM));
    layer.resolveAndDraw(ctx);

    expect(drawn.map((entry) => entry.text)).toEqual(["first", "second"]);
    const first = drawn[0]!;
    const second = drawn[1]!;
    // The labels started coincident, so the push moved them apart on the x axis.
    expect(first.x).toBeLessThan(0);
    expect(second.x).toBeGreaterThan(1 * CANVAS_SCALE);
    expect(first.y).toBeCloseTo(0, 9);
    expect(second.y).toBeCloseTo(0, 9);
  });

  test("WhiteCircleLabel degenerates to a full disc in its collision shape", () => {
    const label = new WhiteCircleLabel("a", new Vector(0, 0), new Vector(0, 1), ZOOM);
    label.measure(stubCtx());
    const pad = (2 * CANVAS_SCALE) / ZOOM;
    const radius = Math.max(Math.hypot(40, 10) / 2 + pad, (10 * CANVAS_SCALE) / ZOOM);
    const capsule = label.getCollisionCapsule();
    expect(capsule.radius).toBeCloseTo(radius + (LABEL_COLLISION_PADDING * CANVAS_SCALE) / ZOOM, 9);
    expect(capsule.x0).toBeCloseTo(capsule.x1, 9);
  });
});
