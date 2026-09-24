import { afterAll, expect, test, vi } from "vitest";
import { Editor } from "../src/engine/sequenceEditor/editor";
import { CANVAS_SCALE } from "../src/engine/constants";
import { LENGTH, WIDTH } from "../src/engine/rink";
import { CTX_METHODS, makeStraightLengthOnePath } from "./helpers";

const EXAMPLE_IMAGE = "data:image/png;base64,AAAA";

// A scheduled frame would append draws after the measured window, so the
// animation frame stays unscheduled and every test drives its own draws.
vi.stubGlobal("requestAnimationFrame", () => 0);

afterAll(() => {
  vi.unstubAllGlobals();
});

function makeEditor() {
  const calls: string[] = [];
  const drawImageArgs: unknown[][] = [];
  // The extra methods below belong to the background image draw path, which is
  // missing from the shared stub list.
  const ctx: Record<string, unknown> = { width: 0, height: 0, globalAlpha: 1 };
  for (const method of [...CTX_METHODS, "arcTo", "clip", "closePath"]) {
    ctx[method] = () => calls.push(method);
  }
  ctx.measureText = () => ({ width: 40, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
  ctx.drawImage = (...args: unknown[]) => {
    calls.push("drawImage");
    drawImageArgs.push(args);
  };
  const canvas = document.createElement("canvas") as HTMLCanvasElement & { getContext: () => unknown };
  Object.defineProperty(canvas, "clientWidth", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "clientHeight", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "getContext", { value: () => ctx, configurable: true });
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 1024, height: 1024 }),
    configurable: true,
  });

  // An empty sequence list isolates the rink: every ctx.stroke then comes from the markings.
  const editor = new Editor(canvas, []);
  editor.mode = "view";
  return { editor, calls, drawImageArgs };
}

const strokes = (calls: string[]) => calls.filter((call) => call === "stroke").length;

// jsdom never loads data URLs, so the cached element must be marked ready manually.
function makeImageReady(editor: Editor): HTMLImageElement {
  const image = (editor as unknown as { backgroundImageElement: HTMLImageElement | null }).backgroundImageElement;
  if (!image) throw new Error("The editor did not create the background image element");
  Object.defineProperty(image, "complete", { value: true, configurable: true });
  Object.defineProperty(image, "naturalWidth", { value: 800, configurable: true });
  Object.defineProperty(image, "naturalHeight", { value: 600, configurable: true });
  return image;
}

test("a background image replaces the default rink lines with the clipped image", () => {
  const { editor, calls, drawImageArgs } = makeEditor();
  editor.draw();
  // The plain rink draws its markings, so strokes exist without the image.
  expect(strokes(calls)).toBeGreaterThan(0);

  calls.length = 0;
  drawImageArgs.length = 0;
  editor.setBackgroundImage(EXAMPLE_IMAGE);
  editor.draw();
  // The image stays unloaded in jsdom, so the plain fill shows without the markings.
  expect(calls.filter((call) => call === "drawImage")).toHaveLength(0);
  expect(strokes(calls)).toBe(0);

  makeImageReady(editor);
  editor.draw();
  // The default rink lines stay hidden when an image is set.
  expect(strokes(calls)).toBe(0);
  // One draw of the image and one clip per frame.
  expect(calls.filter((call) => call === "drawImage")).toHaveLength(1);
  expect(calls.filter((call) => call === "clip")).toHaveLength(1);
  // One arcTo per rounded corner of the rink shape.
  expect(calls.filter((call) => call === "arcTo")).toHaveLength(4);
  expect(calls).toContain("closePath");
  editor.destroy();
});

test("the image draws stretched over the full rink bounds", () => {
  const { editor, calls, drawImageArgs } = makeEditor();
  editor.setBackgroundImage(EXAMPLE_IMAGE);
  const image = makeImageReady(editor);
  calls.length = 0;
  editor.draw();

  expect(calls.filter((call) => call === "drawImage")).toHaveLength(1);
  const width = WIDTH * CANVAS_SCALE;
  const height = LENGTH * CANVAS_SCALE;
  expect(drawImageArgs[0]).toEqual([image, -width / 2, -height / 2, width, height]);
  editor.destroy();
});

test("the opacity cursor lowers the drawn image opacity", () => {
  const { editor, calls } = makeEditor();
  editor.setBackgroundImage(EXAMPLE_IMAGE);
  makeImageReady(editor);
  editor.backgroundImageOpacity = 0.4;
  calls.length = 0;
  editor.draw();

  const alpha = (editor as unknown as { ctx: { globalAlpha: number } }).ctx.globalAlpha;
  expect(alpha).toBe(0.4);
  expect(calls.filter((call) => call === "drawImage")).toHaveLength(1);
  editor.destroy();
});

test("clearing the image restores the plain rink markings", () => {
  const { editor, calls, drawImageArgs } = makeEditor();
  editor.setBackgroundImage(EXAMPLE_IMAGE);
  makeImageReady(editor);
  editor.draw();
  calls.length = 0;
  drawImageArgs.length = 0;
  editor.setBackgroundImage(undefined);
  editor.draw();

  expect(strokes(calls)).toBeGreaterThan(0);
  expect(calls.filter((call) => call === "drawImage")).toHaveLength(0);
  expect(drawImageArgs).toHaveLength(0);
  editor.destroy();
});

test("repeating the same image url never reloads the image element", () => {
  const { editor } = makeEditor();
  editor.setBackgroundImage(EXAMPLE_IMAGE);
  const first = (editor as unknown as { backgroundImageElement: HTMLImageElement }).backgroundImageElement;
  editor.setBackgroundImage(EXAMPLE_IMAGE);
  const second = (editor as unknown as { backgroundImageElement: HTMLImageElement }).backgroundImageElement;
  expect(second).toBe(first);
  editor.destroy();
});

test("clearing then setting a new image rebuilds the image element", () => {
  const { editor } = makeEditor();
  editor.setBackgroundImage(EXAMPLE_IMAGE);
  const first = (editor as unknown as { backgroundImageElement: HTMLImageElement }).backgroundImageElement;
  editor.setBackgroundImage(undefined);
  editor.setBackgroundImage(EXAMPLE_IMAGE);
  const second = (editor as unknown as { backgroundImageElement: HTMLImageElement }).backgroundImageElement;
  expect(second).not.toBe(first);
  editor.destroy();
});
