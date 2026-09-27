import { onBeforeUnmount, onMounted } from "vue";
import { isInteractiveKeyTarget } from "@/utils/keyboard";

// Undo and redo with Ctrl+Z, Ctrl+Y and the Ctrl+Shift+Z redo alias, shared
// by every editor mode. Held-key repeat stays allowed, so a held Ctrl+Z walks
// back several steps.
export function useUndoRedoKeys(undo: () => void, redo: () => void, isActive: () => boolean) {
  function onKeyDown(event: KeyboardEvent) {
    if (!isActive() || isInteractiveKeyTarget(event.target)) return;
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    if (key === "z" && !event.shiftKey) undo();
    else redo();
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeyDown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeyDown);
  });
}
