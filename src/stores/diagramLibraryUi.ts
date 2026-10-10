import { ref } from "vue";
import { defineStore } from "pinia";

// The library dialog hosts in DiagramSidebar root, outside the mobile drawer,
// so the homescreen canvas and the Files tab trigger can open it on any
// viewport.
export const useDiagramLibraryUiStore = defineStore("diagramLibraryUi", () => {
  const libraryOpen = ref(false);
  const libraryRefresh = ref(0);
  return { libraryOpen, libraryRefresh };
});
