import { LENGTH, WIDTH } from "./rink.js";
export const SIZE_X = 1024;
export const SIZE_Y = 1024;

// Adding size poperties to context
export interface CanvasRenderingContext2DSized extends CanvasRenderingContext2D {
  width: number;
  height: number;
}

let canvas: HTMLCanvasElement | null = null;
export let ctx: CanvasRenderingContext2DSized;

export function initCanvas() {
  canvas = document.getElementById("diagram-canvas") as HTMLCanvasElement;

  if (!canvas) {
    console.error("Canvas element not found");
  }

  ctx = canvas?.getContext("2d") as CanvasRenderingContext2DSized;

  // Resize
  canvas.width = SIZE_X;
  canvas.height = SIZE_Y;
  ctx.width = LENGTH;
  ctx.height = WIDTH;
  ctx.scale(SIZE_X / LENGTH, SIZE_Y / WIDTH);
  ctx.translate(ctx.width / 2, ctx.height / 2);

  // CSS
  canvas.style.width = `min(100vw, ${(100 * LENGTH) / WIDTH}vh)`;
  canvas.style.height = `min(${(100 * WIDTH) / LENGTH}vw, 100vh)`;
}
