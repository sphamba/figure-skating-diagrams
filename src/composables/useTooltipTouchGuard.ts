import { onBeforeUnmount, onMounted } from "vue";

// A touch tap emulates a mouse enter, so the tooltip directive would show and
// keep a tooltip that no event ever hides.
const TOUCH_WINDOW_MS = 1000;
const TOUCH_LISTENER_OPTIONS = { capture: true, passive: true } as EventListenerOptions;

export function useTooltipTouchGuard() {
  let lastTouchAt = 0;

  const onTouchStart = () => {
    lastTouchAt = Date.now();
  };

  const onMouseEnter = (event: MouseEvent) => {
    // A recent touch means the enter comes from a tap; the tooltip must stay off.
    if (Date.now() - lastTouchAt < TOUCH_WINDOW_MS) event.stopImmediatePropagation();
  };

  onMounted(() => {
    document.addEventListener("touchstart", onTouchStart, TOUCH_LISTENER_OPTIONS);
    document.addEventListener("mouseenter", onMouseEnter, true);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("touchstart", onTouchStart, TOUCH_LISTENER_OPTIONS);
    document.removeEventListener("mouseenter", onMouseEnter, true);
  });
}
