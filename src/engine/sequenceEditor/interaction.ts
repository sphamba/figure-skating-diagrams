import { draw, viewState } from "./main.js";
import { Vector } from "../vector.js";

const ZOOM_FACTOR = 1.005;

// To mark canvas as selected
const CANVAS = Symbol("canvas");

type MouseState = {
  isDown: boolean;
  selected: unknown | null;
};

const mouseState: MouseState = {
  isDown: false,
  selected: null,
};

addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    viewState.zoom *= Math.pow(ZOOM_FACTOR, -event.deltaY);
    draw();
  },
  { passive: false },
);

addEventListener(
  "mousedown",
  (event) => {
    event.preventDefault();
    mouseState.isDown = true;
    mouseState.selected = CANVAS;
  },
  { passive: false },
);

addEventListener(
  "mousemove",
  (event) => {
    event.preventDefault();
    if (!mouseState.isDown) {
      return;
    }

    const delta = new Vector<2>(event.movementX, event.movementY);

    switch (mouseState.selected) {
      case CANVAS:
        dragCanvas(delta);
        break;
    }
  },
  { passive: false },
);

function dragCanvas(delta: Vector<2>) {
  const invertedY = new Vector<2>(delta.x, -delta.y);
  viewState.center = viewState.center.minus(invertedY.times(1 / viewState.zoom));
  draw();
}

addEventListener(
  "mouseup",
  (event) => {
    event.preventDefault();
    mouseState.isDown = false;
    mouseState.selected = null;
  },
  { passive: false },
);
