import { ref, watch } from "vue";
import { defineStore } from "pinia";

export type InputMode = "mouseKeyboard" | "touch";

const STORAGE_KEY = "input-mode";

// Synthetic mouse events follow a touch on touch screens, so a recent touch
// keeps the mouse listener from switching the mode straight back.
const TOUCH_WINDOW_MS = 1000;

function loadStoredMode(): InputMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "touch" || stored === "mouseKeyboard") return stored;
  } catch {
    // localStorage can be unavailable; the mouse and keyboard default applies.
  }
  return "mouseKeyboard";
}

export const useInputModeStore = defineStore("inputMode", () => {
  const mode = ref<InputMode>(loadStoredMode());

  let lastTouchAt = 0;

  const onTouchStart = () => {
    lastTouchAt = Date.now();
    mode.value = "touch";
  };

  const onMouseDown = () => {
    if (Date.now() - lastTouchAt < TOUCH_WINDOW_MS) return;
    mode.value = "mouseKeyboard";
  };

  const onWheel = () => {
    mode.value = "mouseKeyboard";
  };

  const onKeyDown = () => {
    mode.value = "mouseKeyboard";
  };

  // The listeners ride the capture phase so the canvas handlers cannot hide
  // the events, and they live for the whole app to follow every input.
  document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("wheel", onWheel, { capture: true, passive: true });
  document.addEventListener("keydown", onKeyDown, true);

  watch(
    mode,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch (error) {
        console.error("Could not store the input mode:", error);
      }
    },
    { flush: "sync" },
  );

  return { mode };
});
