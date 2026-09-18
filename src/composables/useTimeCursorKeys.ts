import { onBeforeUnmount, onMounted } from "vue";
import { isInteractiveKeyTarget } from "@/utils/keyboard";

// Left and right arrows move the time cursor, shared by every editor mode.
// A held arrow walks frame by frame, so the repeat events keep stepping.
export function useTimeCursorKeys(step: (direction: 1 | -1) => void, isActive: () => boolean) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!direction || !isActive() || isInteractiveKeyTarget(event.target)) return;
    event.preventDefault();
    step(direction);
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeyDown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeyDown);
  });
}
