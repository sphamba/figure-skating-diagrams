// Render benchmark. Run explicitly: npx vitest run --config vitest.bench.config.ts tests/render.bench.ts
// It measures the pure engine computation per draw() call (the canvas 2D
// context is a no-op stub, so no GPU work is measured).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import { Editor } from "../src/engine/sequenceEditor/editor";
import { Diagram, type DiagramJSON } from "../src/engine/diagram";

const CTX_METHODS = [
  "scale",
  "clearRect",
  "save",
  "restore",
  "beginPath",
  "moveTo",
  "lineTo",
  "bezierCurveTo",
  "stroke",
  "fill",
  "arc",
  "fillRect",
  "strokeRect",
  "translate",
  "rotate",
  "setTransform",
  "closePath",
  "rect",
  "fillText",
];

function makeCanvas() {
  const ctx: Record<string, unknown> = { width: 0, height: 0, globalAlpha: 1 };
  for (const m of CTX_METHODS) ctx[m] = () => {};
  ctx.measureText = () => ({
    width: 40,
    actualBoundingBoxAscent: 8,
    actualBoundingBoxDescent: 2,
  });
  const canvas = document.createElement("canvas") as HTMLCanvasElement & {
    getContext: () => Record<string, unknown>;
  };
  Object.defineProperty(canvas, "clientWidth", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "clientHeight", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "getContext", { value: () => ctx, configurable: true });
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 1024, height: 1024 }),
    configurable: true,
  });
  return canvas;
}

function makeEditor() {
  const json = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../public/diagrams/moves-in-the-field/juvenile_6.json"),
      "utf-8",
    ),
  ) as DiagramJSON;
  const diagram = Diagram.fromJSON(json);
  const canvas = makeCanvas();
  const editor = new Editor(canvas, diagram.sequences);
  editor.mode = "view";
  editor.scaleElements = true;
  editor.showLabels = true;
  editor.drawRange = 1;
  const extent = (editor as unknown as { view: { zoom: number } }).view.zoom;
  return { editor, fitZoom: extent };
}

const ZOOMS = [50, 100, 250, 600, 1200];
const WARMUP = 5;
const SAMPLES = 30;

// Center of the first element of the first sequence; the benchmark looks at
// the same position at every zoom level.
function elementCenter(editor: Editor) {
  const sequence = editor.getSequences()[0]!;
  const element = sequence.elements[0]!;
  const u = ((element.start as number) + (element.end as number)) / 2;
  return sequence.path.getPosition(u as never);
}

test("draw() frame time by zoom level", { timeout: 120000 }, () => {
  const { editor, fitZoom } = makeEditor();
  const center = elementCenter(editor);
  const internals = editor as unknown as {
    view: { center: unknown; zoom: number; rotation: number };
    autoFitRink: boolean;
    videoTimeSeconds: number | null;
  };
  internals.autoFitRink = false;
  internals.videoTimeSeconds = 5.5;

  const levels: Array<[string, number]> = [
    ["fit", fitZoom],
    ...ZOOMS.map((zoom) => [`zoom ${zoom}`, zoom] as [string, number]),
  ];

  for (const [label, zoom] of levels) {
    internals.view = { center: { x: center.x, y: center.y }, zoom, rotation: 0 };
    for (let i = 0; i < WARMUP; i++) editor.draw();
    const times: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const start = performance.now();
      editor.draw();
      times.push(performance.now() - start);
    }
    const mean = times.reduce((sum, t) => sum + t, 0) / SAMPLES;
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(SAMPLES / 2)]!;
    console.info(`draw ${label}: mean ${mean.toFixed(3)} ms, median ${median.toFixed(3)} ms`);
  }
});
