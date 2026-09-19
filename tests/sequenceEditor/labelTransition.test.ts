import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CanvasRenderingContext2DSized } from "../../src/engine/rinkCanvas";
import { CANVAS_SCALE } from "../../src/engine/constants.js";
import {
  LabelLayer,
  PILL_PADDING,
  PILL_SIZE_FACTOR,
  PillLabel,
  type CanvasLabel,
} from "../../src/engine/sequenceEditor/label";
import {
  LABEL_CONTAINER_PORTION,
  LABEL_CONTENT_PORTION,
  LABEL_ENTER_MS,
  LABEL_EXIT_MS,
  LabelTransitions,
  STALL_MS,
  type LabelTransitionBuild,
} from "../../src/engine/sequenceEditor/labelTransition";
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
    measureText: () => ({ width: 40, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
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

// Zoom 100: the stub metrics measure to a pill of half width 26.5 and half height 8.5.
const ZOOM = 100;

const makeBuild = (tracking: { count: number }): LabelTransitionBuild => () => {
  tracking.count++;
  return new PillLabel("x", new Vector(0, 0), null, ZOOM);
};

const capturingLayer = (): { layer: LabelLayer; labels: CanvasLabel[] } => {
  const labels: CanvasLabel[] = [];
  return {
    layer: { add: (label: CanvasLabel) => labels.push(label) } as unknown as LabelLayer,
    labels,
  };
};

/* The anchor and the label sit on the canvas y axis, so the connector triangle
 * is the only drawn path whose points share the anchor x of zero. */
const connectorApexes = (tracked: { moveTo: (x: number, y: number) => void; lineTo: (x: number, y: number) => void }) => {
  const points: Array<{ x: number; y: number }> = [];
  const push = points.push.bind(points);
  tracked.moveTo = (x, y) => {
    if (x === 0) push({ x, y });
  };
  tracked.lineTo = (x, y) => {
    if (x === 0) push({ x, y });
  };
  return points;
};

let now = 0;

// Walks the clock to `until` in stall-sized steps, touching one frame each, so
// no single touch advances past the clamp.
const settle = (
  transitions: LabelTransitions,
  owner: object,
  build: LabelTransitionBuild,
  from: number,
  until: number,
): void => {
  let t = from;
  while (t < until) {
    t = Math.min(t + STALL_MS, until);
    now = t;
    transitions.beginFrame();
    transitions.touch(owner, "name", build);
  }
};

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LabelTransitions", () => {
  test("a new label starts hidden with no text and no connector", () => {
    const transitions = new LabelTransitions();
    transitions.beginFrame();
    expect(transitions.touch({}, "annotation", makeBuild({ count: 0 }))).toEqual({
      container: 0,
      connector: 0,
      text: 0,
    });
  });

  test("the container grows first, then the text and connector appear together", () => {
    const transitions = new LabelTransitions();
    transitions.beginFrame();
    const owner = {};
    const build = makeBuild({ count: 0 });
    transitions.touch(owner, "name", build);

    now = (LABEL_ENTER_MS * LABEL_CONTAINER_PORTION) / 2;
    transitions.beginFrame();
    const growing = transitions.touch(owner, "name", build);
    expect(growing.container).toBeGreaterThan(0);
    expect(growing.connector).toBe(0);
    expect(growing.text).toBe(0);

    now = LABEL_ENTER_MS * LABEL_CONTAINER_PORTION + 1;
    transitions.beginFrame();
    const appearing = transitions.touch(owner, "name", build);
    expect(appearing.container).toBe(1);
    expect(appearing.connector).toBeGreaterThan(0);
    expect(appearing.text).toBeGreaterThan(0);
  });

  test("a shown label settles to full size and misses no frames", () => {
    const transitions = new LabelTransitions();
    transitions.beginFrame();
    const owner = {};
    const build = makeBuild({ count: 0 });
    transitions.touch(owner, "name", build);

    settle(transitions, owner, build, 0, LABEL_ENTER_MS);
    expect(transitions.touch(owner, "name", build)).toEqual({ container: 1, connector: 1, text: 1 });

    now = LABEL_ENTER_MS + 50;
    transitions.beginFrame();
    expect(transitions.touch(owner, "name", build)).toEqual({ container: 1, connector: 1, text: 1 });
  });

  test("the text and connector already start while the container is still growing", () => {
    const transitions = new LabelTransitions();
    transitions.beginFrame();
    const owner = {};
    const build = makeBuild({ count: 0 });
    transitions.touch(owner, "name", build);

    now = (LABEL_ENTER_MS * (LABEL_CONTENT_PORTION + LABEL_CONTAINER_PORTION)) / 2;
    transitions.beginFrame();
    const entering = transitions.touch(owner, "name", build);
    expect(entering.text).toBeGreaterThan(0);
    expect(entering.text).toBeLessThan(1);
    expect(entering.connector).toBeGreaterThan(0);
    expect(entering.connector).toBeLessThan(1);
    // The container is not settled yet, so the content runs over its tail.
    expect(entering.container).not.toBe(1);

    now = LABEL_ENTER_MS;
    transitions.beginFrame();
    expect(transitions.touch(owner, "name", build)).toEqual({ container: 1, connector: 1, text: 1 });
  });

  test("the container overshoots slightly and never goes negative", () => {
    const transitions = new LabelTransitions();
    transitions.beginFrame();
    const owner = {};
    const build = makeBuild({ count: 0 });
    transitions.touch(owner, "name", build);

    now = (LABEL_ENTER_MS * LABEL_CONTAINER_PORTION * 2) / 3;
    transitions.beginFrame();
    expect(transitions.touch(owner, "name", build).container).toBeGreaterThan(1);

    now = LABEL_ENTER_MS;
    transitions.beginFrame();
    expect(transitions.touch(owner, "name", build).container).toBe(1);
  });

  test("an exit draws shrinking labels with fresh geometry and drops the state at the end", () => {
    const transitions = new LabelTransitions();
    transitions.beginFrame();
    const owner = {};
    const tracking = { count: 0 };
    transitions.touch(owner, "name", makeBuild(tracking));

    settle(transitions, owner, makeBuild(tracking), 0, LABEL_ENTER_MS);

    // The leave starts the exit: the first frame still draws the full label.
    now = LABEL_ENTER_MS + 101;
    transitions.beginFrame();
    const { layer, labels } = capturingLayer();
    transitions.collectExit(layer);
    expect(labels).toHaveLength(1);
    expect(tracking.count).toBe(1);
    const leaving = labels[0] as PillLabel;
    leaving.measure(stubCtx());
    expect(leaving.getTransition()?.text).toBe(1);

    // The shrink shows with the elapsed exit time.
    now = LABEL_ENTER_MS + 151;
    transitions.beginFrame();
    const { labels: shrinking } = capturingLayer();
    transitions.collectExit({ add: (label: CanvasLabel) => shrinking.push(label) } as unknown as LabelLayer);
    expect(shrinking).toHaveLength(1);
    const exiting = shrinking[0] as PillLabel;
    exiting.measure(stubCtx());
    expect(exiting.isVisible()).toBe(true);
    expect(exiting.getTransition()?.text).toBeGreaterThan(0);
    expect(exiting.getTransition()?.text).toBeLessThan(1);

    // The state drops after the exit completes.
    now = LABEL_ENTER_MS + 101 + LABEL_EXIT_MS + 1;
    transitions.beginFrame();
    const { labels: after } = capturingLayer();
    transitions.collectExit({ add: () => {} } as unknown as LabelLayer);
    expect(after).toHaveLength(0);
    expect(transitions.animating()).toBe(false);
  });

  test("a label that reappears during its exit resumes without restarting and stays single", () => {
    const transitions = new LabelTransitions();
    transitions.beginFrame();
    const owner = {};
    const tracking = { count: 0 };
    const build = makeBuild(tracking);
    transitions.touch(owner, "name", build);

    settle(transitions, owner, build, 0, LABEL_ENTER_MS);

    // One frame with no touch: the exit starts at the full label.
    now = LABEL_ENTER_MS + 61;
    transitions.beginFrame();
    const { layer, labels } = capturingLayer();
    transitions.collectExit(layer);
    expect(labels).toHaveLength(1);

    // The exit shrinks with the elapsed time.
    now = LABEL_ENTER_MS + 111;
    transitions.beginFrame();
    const { labels: shrinking } = capturingLayer();
    transitions.collectExit({ add: (label: CanvasLabel) => shrinking.push(label) } as unknown as LabelLayer);
    expect(shrinking).toHaveLength(1);

    // Back within the very same frame state: no restart, no duplicate state.
    const resumed = transitions.touch(owner, "name", build);
    expect(resumed.container).toBeGreaterThan(0);
    expect(resumed.text).toBeGreaterThan(0);
    expect(resumed.text).toBeLessThan(1);
    expect(tracking.count).toBe(2);

    // The state stays keyed per owner and variant, so the state continues.
    now = LABEL_ENTER_MS + 161;
    transitions.beginFrame();
    labels.length = 0;
    transitions.collectExit({ add: () => {} } as unknown as LabelLayer);
    expect(labels).toHaveLength(0);
  });

  test("animating is true while a transition runs and false once settled", () => {
    const transitions = new LabelTransitions();
    transitions.beginFrame();
    const owner = {};
    const build = makeBuild({ count: 0 });
    transitions.touch(owner, "name", build);
    expect(transitions.animating()).toBe(true);

    settle(transitions, owner, build, 0, LABEL_ENTER_MS);
    transitions.beginFrame();
    transitions.touch(owner, "name", build);
    expect(transitions.animating()).toBe(false);

    now = LABEL_ENTER_MS + 51;
    transitions.beginFrame();
    transitions.collectExit({ add: () => {} } as unknown as LabelLayer);
    expect(transitions.animating()).toBe(true);
  });

  test("finishAll settles touched labels and drops exits in flight", () => {
    const transitions = new LabelTransitions();
    transitions.beginFrame();
    const touchOwner = {};
    const exitOwner = {};
    const build = makeBuild({ count: 0 });
    transitions.touch(touchOwner, "name", build);
    transitions.touch(exitOwner, "name", build);

    settle(transitions, touchOwner, build, 0, LABEL_ENTER_MS);
    // exitOwner stays untouched in this frame, so it exits.

    transitions.finishAll();
    expect(transitions.touch(touchOwner, "name", build)).toEqual({ container: 1, connector: 1, text: 1 });
    expect(transitions.touch(exitOwner, "name", build)).toEqual({ container: 0, connector: 0, text: 0 });
  });

  test("an exit with a null build drains and drops its state", () => {
    const transitions = new LabelTransitions();
    transitions.beginFrame();
    const owner = {};
    transitions.touch(owner, "name", () => null);

    now = LABEL_ENTER_MS + 1;
    transitions.beginFrame();
    transitions.touch(owner, "name", () => null);

    now = LABEL_ENTER_MS + 151;
    transitions.beginFrame();
    transitions.collectExit({ add: () => {} } as unknown as LabelLayer);
    expect(transitions.animating()).toBe(true);

    now = LABEL_ENTER_MS + 151 + LABEL_EXIT_MS + 1;
    transitions.beginFrame();
    transitions.collectExit({ add: () => {} } as unknown as LabelLayer);
    expect(transitions.animating()).toBe(false);
  });

  test("clear drops every state", () => {
    const transitions = new LabelTransitions();
    transitions.beginFrame();
    transitions.touch({}, "annotation", makeBuild({ count: 0 }));
    transitions.clear();
    expect(transitions.animating()).toBe(false);
  });
});

/* Half back height of the stub pill at full scale, in canvas units. The stub
 * metrics measure an ascent of 8 px and a descent of 2 px. */
const halfB = ((8 + 2) / 2) * PILL_SIZE_FACTOR + (PILL_PADDING * CANVAS_SCALE) / ZOOM;

describe("CanvasLabel transition drawing", () => {
  test("the container scale shrinks the extents and slides the home position to the anchor", () => {
    const point = new Vector(0, -1);
    const direction = new Vector(0, 1);
    const full = new PillLabel("a", point, direction, ZOOM);
    const scaled = new PillLabel("a", point, direction, ZOOM);
    scaled.setTransition({ container: 0.5, connector: 0, text: 0 });
    full.measure(stubCtx());
    scaled.measure(stubCtx());

    const fullCapsule = full.getCollisionCapsule();
    const scaledCapsule = scaled.getCollisionCapsule();
    // The collision radius shrinks by half of the unscaled background radius.
    expect(fullCapsule.radius - scaledCapsule.radius).toBeCloseTo(halfB / 2, 6);
    // The home position slides out of the anchor as the label grows.
    expect(fullCapsule.y0).toBeLessThan(scaledCapsule.y0);
  });

  test("draw skips at container zero and hides the text without text progress", () => {
    const tracked = stubCtx() as unknown as {
      fillText: (text: string, x: number, y: number) => void;
      globalAlpha: number;
      moveTo: (x: number, y: number) => void;
      lineTo: (x: number, y: number) => void;
    };
    const drawn: string[] = [];
    const fillText = tracked.fillText.bind(tracked);
    tracked.fillText = (text, x, y) => {
      drawn.push(text);
      fillText(text, x, y);
    };
    const moves = connectorApexes(tracked);

    const hidden = new PillLabel("a", new Vector(0, 0), null, ZOOM);
    hidden.setTransition({ container: 0, connector: 0, text: 0 });
    hidden.measure(stubCtx());
    hidden.draw(tracked as unknown as CanvasRenderingContext2DSized);
    expect(drawn).toHaveLength(0);

    const growing = new PillLabel("a", new Vector(0, 0), null, ZOOM);
    growing.setTransition({ container: 0.5, connector: 0, text: 0 });
    growing.measure(stubCtx());
    growing.draw(tracked as unknown as CanvasRenderingContext2DSized);
    expect(drawn).toHaveLength(0);

    const settled = new PillLabel("a", new Vector(0, 0), null, ZOOM);
    settled.setTransition({ container: 1, connector: 1, text: 1 });
    settled.measure(stubCtx());
    settled.draw(tracked as unknown as CanvasRenderingContext2DSized);
    expect(drawn).toEqual(["a"]);
  });

  test("the label is invisible at container zero and visible when measured", () => {
    const hidden = new PillLabel("a", new Vector(0, 0), null, ZOOM);
    hidden.setTransition({ container: 0, connector: 0, text: 0 });
    hidden.measure(stubCtx());
    expect(hidden.isVisible()).toBe(false);
    const visible = new PillLabel("a", new Vector(0, 0), null, ZOOM);
    visible.measure(stubCtx());
    expect(visible.isVisible()).toBe(true);
  });
});

describe("PillLabel connector growth", () => {
  test("the connector draws nothing at zero growth and reaches the anchor at one", () => {
    const tracked = stubCtx() as unknown as {
      moveTo: (x: number, y: number) => void;
      lineTo: (x: number, y: number) => void;
      draw: (ctx: CanvasRenderingContext2DSized) => void;
    };
    // The anchor sits below the label, so the connector grows upward in canvas
    // units: the apex y shrinks from the label center to the anchor y.
    const anchor = new Vector(0, -0.1);
    const direction = new Vector(0, 1);
    const anchorY = -anchor.y * CANVAS_SCALE;

    const drawAt = (growth: number) => {
      const points = connectorApexes(tracked);
      const label = new PillLabel("a", anchor, direction, ZOOM, { connector: true });
      label.setTransition({ container: 1, connector: growth, text: 1 });
      label.measure(stubCtx());
      label.draw(tracked as unknown as CanvasRenderingContext2DSized);
      return points;
    };

    expect(drawAt(0)).toHaveLength(0);

    const full = drawAt(1);
    for (const point of full) expect(point.y).toBeCloseTo(anchorY, 6);

    const half = drawAt(0.5);
    // Straight direction, so the home center sits one offset plus one support
    // away from the anchor, and the half growth apex sits halfway to it.
    const center = anchorY - (12 * CANVAS_SCALE) / ZOOM - halfB;
    const midApex = center + (anchorY - center) / 2;
    for (const point of half) expect(point.y).toBeCloseTo(midApex, 6);
  });
});
