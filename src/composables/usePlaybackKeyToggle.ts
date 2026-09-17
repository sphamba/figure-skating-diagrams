import { onBeforeUnmount, onMounted } from "vue";

// Toggle the playback with the space key, shared by the home and editor views.
// Buttons, option rows and text-like targets keep their own space behavior.
export function usePlaybackKeyToggle(toggle: () => void) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.code !== "Space" || event.repeat) return;
    const target = event.target;
    const interactive =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) ||
        target.closest('[role="option"]') !== null);
    if (interactive) return;
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
