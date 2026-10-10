import { useConfirm } from "openvue/useconfirm";
import { useI18n } from "vue-i18n";
import { useDiagramLibraryUiStore } from "@/stores/diagramLibraryUi";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";

// Unsaved-changes guard for opening the library dialog, shared by the sidebar
// Files tab and the homescreen canvas. The ConfirmDialog for the group renders
// in DiagramSidebar, outside the mobile drawer.
export function useGuardedLibraryOpen() {
  const confirm = useConfirm();
  const { t } = useI18n();
  const editorStore = useSequenceEditorStore();
  const libraryUi = useDiagramLibraryUiStore();

  function openLibrary() {
    if (!editorStore.isUnsaved()) {
      libraryUi.libraryOpen = true;
      return;
    }
    confirm.require({
      group: "diagram-sidebar-open-library",
      header: t("files.confirm.unsavedHeader"),
      message: t("files.confirm.openLibraryMessage"),
      icon: "pi pi-exclamation-triangle",
      rejectLabel: t("files.confirm.cancel"),
      acceptLabel: t("files.confirm.open"),
      acceptProps: { severity: "warning" },
      rejectProps: { severity: "secondary", text: true },
      accept: () => {
        libraryUi.libraryOpen = true;
      },
    });
  }

  return { openLibrary };
}
