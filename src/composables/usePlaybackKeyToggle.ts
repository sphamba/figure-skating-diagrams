import { onBeforeUnmount, onMounted } from "vue";
import { isInteractiveKeyTarget } from "@/utils/keyboard";

// Toggle the playback with the space key, shared by the home and editor views.
export function usePlaybackKeyToggle(toggle: () => void) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.code !== "Space" || event.repeat) return;
    if (isInteractiveKeyTarget(event.target)) return;
    event.preventDefault();
    toggle();
  }

  // A mouse click leaves the button focused: space would then reactivate it
  // instead of toggling the playback. Keyboard activation keeps the focus.
  function onWindowClick(event: MouseEvent) {
    if (event.detail === 0) return;
    const button = (event.target as HTMLElement | null)?.closest("button");
    if (button) button.blur();
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("click", onWindowClick, true);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("click", onWindowClick, true);
  });
}
