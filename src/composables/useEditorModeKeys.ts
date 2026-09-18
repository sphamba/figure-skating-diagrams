import { onBeforeUnmount, onMounted, type Ref } from "vue";
import type { EditMode } from "@/engine/sequenceEditor/editor";
import { isInteractiveKeyTarget } from "@/utils/keyboard";

// The uppercase letters keep the caps lock and the shift key working.
const MODE_KEYS: Partial<Record<string, EditMode>> = {
  V: "view",
  P: "path",
  E: "elements",
  T: "timing",
  A: "annotations",
};

// Switch editor modes with the key letters, shared by every editor mode.
export function useEditorModeKeys(editMode: Ref<EditMode>, isActive: () => boolean) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const mode = MODE_KEYS[event.key.toUpperCase()];
    if (!mode || !isActive() || isInteractiveKeyTarget(event.target)) return;
    event.preventDefault();
    editMode.value = mode;
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeyDown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeyDown);
  });
}
