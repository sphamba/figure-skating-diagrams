import { describe, expect, test } from "vitest";
import type { CanvasRenderingContext2DSized } from "../../src/engine/rinkCanvas";
import { CANVAS_SCALE, RINK_COLOR } from "../../src/engine/constants.js";
import {
  ACTION_BUTTON_COG_LINE_WIDTH,
  ACTION_BUTTON_LINE_WIDTH,
  ACTION_BUTTON_RADIUS,
  ACTION_BUTTON_WEIGHT,
  buttonDiscColor,
  CIRCLE_LABEL_MIN_RADIUS,
  CogButtonLabel,
  LABEL_ANCHOR_LIMIT,
  LABEL_COLLISION_PADDING,
  LABEL_FONT_SIZE_SMALL,
  LabelLayer,
  MinusButtonLabel,
  PILL_BACKDROP_PADDING,
  PILL_COLOR,
  PILL_CONNECTOR_BASE,
  PILL_PADDING,
  PILL_PADDING_SMALL,
  PILL_SIZE_FACTOR,
  PILL_SIZE_FACTOR_SMALL,
  PillLabel,
  PlusButtonLabel,
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
    save: () => {},
    restore: () => {},
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
    // halfB = half text height times the size factor, plus the pill padding.
    expect(captured[0]!.lineWidth).toBeCloseTo(
      2 *
        (5 * PILL_SIZE_FACTOR +
          (PILL_PADDING * CANVAS_SCALE) / ZOOM +
          (PILL_BACKDROP_PADDING * CANVAS_SCALE) / ZOOM),
      9,
    );
    expect(captured[1]!.kind).toBe("stroke");
    expect(captured[1]!.alpha).toBeCloseTo(0.24, 9);
    expect(captured[1]!.strokeStyle).toBe(PILL_COLOR);
    expect(captured[1]!.lineWidth).toBeCloseTo(2 * (5 * PILL_SIZE_FACTOR + (PILL_PADDING * CANVAS_SCALE) / ZOOM), 9);
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
    // The connector draws between the pill background and the pill foreground.
    expect(captured.indexOf(triangle[0]!)).toBe(2);
    expect(captured.indexOf(triangle[1]!)).toBe(3);
    // The stroked triangle uses the rink color. The stroke width scales
    // inversely with the zoom; the scaling invariant is a separate test.
    expect(triangle[0]!.kind).toBe("stroke");
    expect(triangle[0]!.color).toBe(RINK_COLOR);
    expect(triangle[0]!.lineWidth).toBeGreaterThan(0);
    // The filled triangle above it uses the pill color.
    expect(triangle[1]!.kind).toBe("fill");
    expect(triangle[1]!.color).toBe(PILL_COLOR);
    for (const entry of triangle) {
      // The apex sits on the anchor point.
      expect(entry.points[0]).toEqual([1 * CANVAS_SCALE, -2 * CANVAS_SCALE]);
    }
    // The base corners sit at the pill center, PILL_CONNECTOR_BASE screen px
    // apart, along the direction perpendicular to the anchor axis.
    const capsule = label.getCollisionCapsule();
    const center = [capsule.x0 + (capsule.x1 - capsule.x0) / 2, capsule.y0];
    const [corner1 = [0, 0], corner2 = [0, 0]] = triangle[0]!.points.slice(1) as number[][];
    expect(Math.hypot(corner1[0] - corner2[0], corner1[1] - corner2[1])).toBeCloseTo(
      (PILL_CONNECTOR_BASE * CANVAS_SCALE) / ZOOM,
      9,
    );
    expect(corner1[0] + corner2[0]).toBeCloseTo(2 * center[0], 9);
    expect(corner1[1] + corner2[1]).toBeCloseTo(2 * center[1], 9);
  });

  test("an upright label counter-rotates the pill about its own position", () => {
    const tracked = stubCtx() as unknown as CanvasRenderingContext2DSized & Record<string, unknown>;
    const captured: { name: "translate" | "rotate"; args: number[] }[] = [];
    for (const name of ["translate", "rotate"] as const) {
      const previous = tracked[name] as unknown as ((...args: number[]) => void) | undefined;
      const hook = (...args: number[]) => {
        captured.push({ name, args: [...args] });
        previous?.(...args);
      };
      (tracked as unknown as Record<string, (...args: number[]) => void>)[name] = hook;
    }
    const label = new PillLabel("a", new Vector(0, 0), null, ZOOM, { rotation: Math.PI / 2 });
    label.measure(stubCtx());
    const position = label as unknown as { x: number; y: number };
    label.draw(tracked);
    expect(captured.map((entry) => entry.name)).toEqual(["translate", "rotate", "translate"]);
    expect(captured[0]!.args).toEqual([position.x, position.y]);
    expect(captured[1]!.args[0]).toBeCloseTo(Math.PI / 2, 9);
    expect(captured[2]!.args).toEqual([-position.x, -position.y]);
  });

  test("a rotated connector emits the inverse rotation around drawConnector", () => {
    const tracked = stubCtx() as unknown as CanvasRenderingContext2DSized & Record<string, unknown>;
    const captured: { name: string; args: number[] }[] = [];
    for (const name of ["translate", "rotate"] as const) {
      const previous = tracked[name] as unknown as ((...args: number[]) => void) | undefined;
      const hook = (...args: number[]) => {
        captured.push({ name, args: [...args] });
        previous?.(...args);
      };
      (tracked as unknown as Record<string, (...args: number[]) => void>)[name] = hook;
    }
    const label = new PillLabel("a", new Vector(1, 2), new Vector(0, 1), ZOOM, {
      connector: true,
      rotation: Math.PI / 3,
    });
    label.measure(stubCtx());
    const position = label as unknown as { x: number; y: number };
    label.draw(tracked);
    // The upright wrap rotates +rotation, and the connector wrap undoes it
    // inside drawBackground, so the triangle keeps rotating with the canvas.
    expect(captured.map((entry) => entry.name)).toEqual([
      "translate",
      "rotate",
      "translate",
      "translate",
      "rotate",
      "translate",
    ]);
    expect(captured[1]!.args[0]).toBeCloseTo(Math.PI / 3, 9);
    expect(captured[4]!.args[0]).toBeCloseTo(-Math.PI / 3, 9);
    for (const index of [0, 3]) {
      expect(captured[index]!.args[0]).toBeCloseTo(position.x, 9);
      expect(captured[index]!.args[1]).toBeCloseTo(position.y, 9);
    }
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
    let points = 0;
    const captured: number[] = [];
    tracked.beginPath = () => {
      points = 0;
    };
    tracked.moveTo = () => {
      points += 1;
    };
    tracked.lineTo = () => {
      points += 1;
    };
    tracked.stroke = () => {
      captured.push(points);
    };
    tracked.fill = () => {
      captured.push(points);
    };
    const label = new PillLabel("a", new Vector(2, 3), null, ZOOM, { connector: true });
    label.measure(stubCtx());
    label.draw(tracked as unknown as CanvasRenderingContext2DSized);
    // The centered label has a zero-length axis, so the connector draws
    // nothing: only the pill background and foreground show up.
    expect(captured).toEqual([2, 2, 2]);
  });
});

describe("CanvasLabel collision", () => {
  test("getCollisionCapsule matches the grown pill background extents", () => {
    const label = new PillLabel("a", new Vector(0, 0), null, ZOOM);
    label.measure(stubCtx());
    const capsule = label.getCollisionCapsule();
    const pad = (PILL_PADDING * CANVAS_SCALE) / ZOOM;
    const halfA = 20 * PILL_SIZE_FACTOR + pad;
    const halfB = 5 * PILL_SIZE_FACTOR + pad;
    const radius = halfB + (LABEL_COLLISION_PADDING * CANVAS_SCALE) / ZOOM;
    expect(capsule.radius).toBeCloseTo(radius, 9);
    expect(capsule.y0).toBeCloseTo(0, 9);
    expect(capsule.x0).toBeCloseTo(-(halfA - halfB), 9);
    expect(capsule.x1).toBeCloseTo(halfA - halfB, 9);
  });

  test("moveBy keeps the label within the anchor limit of its home", () => {
    const label = new PillLabel("a", new Vector(1, 2), null, ZOOM);
    label.measure(stubCtx());
    const pad = (PILL_PADDING * CANVAS_SCALE) / ZOOM;
    const limit = LABEL_ANCHOR_LIMIT * (5 * PILL_SIZE_FACTOR + pad);
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

  test("a smaller-font pill grows by the small scale and padding", () => {
    const label = new PillLabel("a", new Vector(0, 0), null, ZOOM, {
      fontSizePx: LABEL_FONT_SIZE_SMALL,
    });
    label.measure(stubCtx());
    const capsule = label.getCollisionCapsule();
    const pad = (PILL_PADDING_SMALL * CANVAS_SCALE) / ZOOM;
    const halfA = 20 * PILL_SIZE_FACTOR_SMALL + pad;
    const halfB = 5 * PILL_SIZE_FACTOR_SMALL + pad;
    expect(capsule.radius).toBeCloseTo(halfB + (LABEL_COLLISION_PADDING * CANVAS_SCALE) / ZOOM, 9);
    expect(capsule.x0).toBeCloseTo(-(halfA - halfB), 9);
    expect(capsule.x1).toBeCloseTo(halfA - halfB, 9);
  });

  test("WhiteCircleLabel degenerates to a full disc in its collision shape", () => {
    const label = new WhiteCircleLabel("a", new Vector(0, 0), new Vector(0, 1), ZOOM, {
      fontSizePx: LABEL_FONT_SIZE_SMALL,
    });
    label.measure(stubCtx());
    const pad = (PILL_PADDING_SMALL * CANVAS_SCALE) / ZOOM;
    const radius = Math.max(
      (Math.hypot(40, 10) / 2) * PILL_SIZE_FACTOR_SMALL + pad,
      (CIRCLE_LABEL_MIN_RADIUS * CANVAS_SCALE) / ZOOM,
    );
    const capsule = label.getCollisionCapsule();
    expect(capsule.radius).toBeCloseTo(radius + (LABEL_COLLISION_PADDING * CANVAS_SCALE) / ZOOM, 9);
    expect(capsule.x0).toBeCloseTo(capsule.x1, 9);
  });

  test("a narrow-number circle label keeps one radius, so the backdrop stays a circle", () => {
    // The digit 1 measures much wider than tall would be an oval: the extent
    // must come from one radius, not the per-axis pill extents.
    const tracked = stubCtx() as unknown as CanvasRenderingContext2DSized & Record<string, unknown>;
    tracked.measureText = (text: string) =>
      text === ""
        ? { width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }
        : { width: 4, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
    const radii: number[] = [];
    const previousArc = tracked.arc as unknown as (...args: number[]) => void;
    tracked.arc = (...args: number[]) => {
      radii.push(args[2]);
      previousArc?.(...args);
    };

    const label = new WhiteCircleLabel("1", new Vector(0, 0), new Vector(0, 1), ZOOM, {
      fontSizePx: LABEL_FONT_SIZE_SMALL,
    });
    label.measure(tracked);
    label.draw(tracked);

    // One radius from the text diagonal: neither the per-axis width nor height.
    const expected = (Math.hypot(4, 10) / 2) * PILL_SIZE_FACTOR_SMALL + (PILL_PADDING_SMALL * CANVAS_SCALE) / ZOOM;
    expect(radii[0]).toBeCloseTo(expected, 9);
    const capsule = label.getCollisionCapsule();
    expect(capsule.radius).toBeCloseTo(expected + (LABEL_COLLISION_PADDING * CANVAS_SCALE) / ZOOM, 9);
    // Zero straight segment: the background half extents stay equal, a disc.
    expect(capsule.x0).toBeCloseTo(capsule.x1, 9);
  });
});

describe("ActionButtonLabel", () => {
  test("weights a button 10x and a plain label 1x", () => {
    const pill = new PillLabel("a", new Vector(0, 0), null, ZOOM);
    expect(pill.getCollisionWeight()).toBe(1);
    const button = new PlusButtonLabel(new Vector(0, 0), ZOOM, "#d33");
    expect(button.getCollisionWeight()).toBe(ACTION_BUTTON_WEIGHT);
  });

  test("a collision moves a button 10x less than a weight 1 label", () => {
    const button = new PlusButtonLabel(new Vector(0, 0), ZOOM, "#d33");
    const pill = new PillLabel("a", new Vector(0.28, 0), null, ZOOM);
    button.measure(stubCtx());
    pill.measure(stubCtx());
    const separation = capsuleSeparation(button.getCollisionCapsule(), pill.getCollisionCapsule());
    expect(separation).not.toBeNull();
    // LABEL_PUSH_FACTOR 0.75 shares the full resolution distance between the pair.
    const total = separation!.overlap * 0.75;
    const layer = new LabelLayer();
    layer.add(button);
    layer.add(pill);
    layer.resolveAndDraw(stubCtx());
    // The button is heavier, so it takes the 1/11 share and the pill the 10/11 share.
    expect(button.getResolvedCanvasPosition().x).toBeCloseTo(-total / (1 + ACTION_BUTTON_WEIGHT), 9);
    expect((pill as unknown as { x: number }).x).toBeCloseTo(
      0.28 * CANVAS_SCALE + (total * ACTION_BUTTON_WEIGHT) / (1 + ACTION_BUTTON_WEIGHT),
      9,
    );
  });

  test("a button anchors at its point and keeps a full disc capsule", () => {
    const button = new MinusButtonLabel(new Vector(2, 3), ZOOM, "#d33");
    button.measure(stubCtx());
    expect(button.isVisible()).toBe(true);
    expect(button.getResolvedCanvasPosition()).toEqual({ x: 2 * CANVAS_SCALE, y: -3 * CANVAS_SCALE });
    const capsule = button.getCollisionCapsule();
    const radius = ((ACTION_BUTTON_RADIUS + LABEL_COLLISION_PADDING) * CANVAS_SCALE) / ZOOM;
    expect(capsule.radius).toBeCloseTo(radius, 9);
    expect(capsule.x0).toBeCloseTo(capsule.x1, 9);
  });

  test("a plus button draws the tinted disc, then the outline and symbol, with no text", () => {
    const tracked = stubCtx() as unknown as {
      globalAlpha: number;
      fillStyle: string;
      strokeStyle: string;
      lineWidth: number;
      fillText: (text: string, x: number, y: number) => void;
      fill: () => void;
      stroke: () => void;
    };
    const captured: Array<{ kind: "fill" | "stroke" | "text"; alpha: number; color: string; lineWidth: number }> = [];
    const fill = tracked.fill;
    const stroke = tracked.stroke;
    tracked.fill = () => {
      captured.push({ kind: "fill", alpha: tracked.globalAlpha, color: tracked.fillStyle, lineWidth: tracked.lineWidth });
      fill();
    };
    tracked.stroke = () => {
      captured.push({ kind: "stroke", alpha: tracked.globalAlpha, color: tracked.strokeStyle, lineWidth: tracked.lineWidth });
      stroke();
    };
    tracked.fillText = (text: string, x: number, y: number) => {
      captured.push({ kind: "text", alpha: tracked.globalAlpha, color: text, lineWidth: x + y });
    };
    const button = new PlusButtonLabel(new Vector(1, 2), ZOOM, "#1976d2");
    button.measure(stubCtx());
    button.draw(tracked as unknown as CanvasRenderingContext2DSized);
    // One disc fill, then the circle stroke and one more stroke for both plus bars.
    expect(captured).toHaveLength(3);
    expect(captured[0]!.kind).toBe("fill");
    expect(captured[0]!.alpha).toBeCloseTo(1, 9);
    expect(captured[0]!.color).toBe(buttonDiscColor("#1976d2"));
    for (const entry of captured.slice(1)) {
      expect(entry.kind).toBe("stroke");
      expect(entry.alpha).toBe(1);
      expect(entry.color).toBe("#1976d2");
      expect(entry.lineWidth).toBeCloseTo((ACTION_BUTTON_LINE_WIDTH * CANVAS_SCALE) / ZOOM, 9);
    }
  });

  test("the connector stroke width scales inversely with the zoom", () => {
    // The connector stroke width comes from an inline src screen width, so the
    // test keeps only the zoom-scaling invariant, not a pinned number.
    const connectorStrokeWidth = (zoom: number): number => {
      const tracked = stubCtx() as unknown as Record<string, unknown> & {
        strokeStyle: string;
        lineWidth: number;
      };
      const widths: number[] = [];
      let points = 0;
      tracked.beginPath = () => {
        points = 0;
      };
      tracked.moveTo = () => {
        points += 1;
      };
      tracked.lineTo = () => {
        points += 1;
      };
      tracked.stroke = () => {
        // The connector triangle is the only rink stroke with three points;
        // the backdrop stroke has two.
        if (tracked.strokeStyle === RINK_COLOR && points === 3) widths.push(tracked.lineWidth);
      };
      const label = new PillLabel("a", new Vector(1, 2), new Vector(0, 1), zoom, { connector: true });
      label.measure(stubCtx());
      label.draw(tracked as unknown as CanvasRenderingContext2DSized);
      return widths[0]!;
    };
    const atFullZoom = connectorStrokeWidth(ZOOM);
    expect(atFullZoom).toBeGreaterThan(0);
    expect(connectorStrokeWidth(ZOOM / 2)).toBeCloseTo(atFullZoom * 2, 6);
  });

  test("a cog button strokes the inner circle and all teeth at the cog width", () => {
    const tracked = stubCtx() as unknown as {
      globalAlpha: number;
      strokeStyle: string;
      lineWidth: number;
      fill: () => void;
      stroke: () => void;
    };
    const captured: Array<{ kind: "fill" | "stroke"; color: string; lineWidth: number }> = [];
    tracked.stroke = () => {
      captured.push({ kind: "stroke", color: tracked.strokeStyle, lineWidth: tracked.lineWidth });
    };
    tracked.fill = () => {
      captured.push({ kind: "fill", color: tracked.fillStyle, lineWidth: tracked.lineWidth });
    };
    const button = new CogButtonLabel(new Vector(0, 0), ZOOM, "#444444");
    button.measure(stubCtx());
    button.draw(tracked as unknown as CanvasRenderingContext2DSized);
    // The cog has no disc background.
    expect(captured.every((entry) => entry.kind === "stroke")).toBe(true);
    expect(captured).toHaveLength(9);
    for (const entry of captured) {
      expect(entry.color).toBe("#444444");
      // Thick circle and teeth, thicker than the short teeth are long.
      expect(entry.lineWidth).toBeCloseTo((ACTION_BUTTON_COG_LINE_WIDTH * CANVAS_SCALE) / ZOOM, 9);
    }
  });
});
