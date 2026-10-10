import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useDiagramLibraryUiStore } from "@/stores/diagramLibraryUi";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";
import { fetchBundledDiagram, loadSavedDiagram } from "@/utils/diagramLibrary";
import { decodeJsonFile } from "@/utils/jsonGzip";
import type { PatternJSON } from "@/engine/pattern";
import type { DiagramJSON } from "@/engine/diagram";
import type { SequenceJSON } from "@/engine/sequence";
import type { DiagramTreeSource } from "@/components/DiagramTree.vue";

// Loading a diagram into the store, shared by the sidebar library dialog
// (hosted in DiagramSidebar outside the mobile drawer) and the Files tab JSON
// file picker. The dialog closes through the shared store flag; the callbacks
// report to the consumer: the playback pauses on load-start and the mobile
// drawer closes on close.
export function useLibraryLoad(callbacks: { onLoadStart: () => void; onClose: () => void; onLoadError?: () => void }) {
  const store = useSequenceEditorStore();
  const libraryUi = useDiagramLibraryUiStore();
  const { t } = useI18n();
  const loadFailed = ref(false);

  function isPattern(json: PatternJSON | DiagramJSON | SequenceJSON): json is PatternJSON {
    return Array.isArray((json as PatternJSON).sequences);
  }

  function isSequenceJSON(json: PatternJSON | DiagramJSON | SequenceJSON): json is SequenceJSON {
    return "path" in json && "keyframes" in json;
  }

  function loadIntoStore(json: PatternJSON | DiagramJSON | SequenceJSON) {
    if (isPattern(json)) {
      store.loadFromJSON(json);
    } else if (isSequenceJSON(json)) {
      store.loadFromJSON({ name: t("files.defaultDiagramName"), sequences: [json] });
    } else {
      store.loadFromJSON(json);
    }
  }

  async function loadDiagramSource(path: string) {
    loadFailed.value = false;
    try {
      const json = (await fetchBundledDiagram(path)) as PatternJSON | DiagramJSON | SequenceJSON;
      callbacks.onLoadStart();
      store.setSaveFilename(path.split("/").pop() ?? "");
      loadIntoStore(json);
      // Only a full diagram is shareable by path, and the load clears the origin,
      // so the origin travels after it.
      if (isPattern(json)) store.setBundledPath(path);
      libraryUi.libraryOpen = false;
      callbacks.onClose();
    } catch (error) {
      loadFailed.value = true;
      console.error("Could not open the diagram file:", error);
      callbacks.onLoadError?.();
    }
  }

  async function openSavedDiagram(name: string) {
    loadFailed.value = false;
    try {
      const json = await loadSavedDiagram(name);
      if (json === null) throw new Error(`No saved diagram named "${name}".`);
      callbacks.onLoadStart();
      store.setSaveFilename(name);
      loadIntoStore(json as PatternJSON | DiagramJSON | SequenceJSON);
      libraryUi.libraryOpen = false;
      callbacks.onClose();
    } catch {
      loadFailed.value = true;
      callbacks.onLoadError?.();
    }
  }

  function openDiagramSource(source: DiagramTreeSource) {
    if (source.source === "saved") void openSavedDiagram(source.name);
    else void loadDiagramSource(source.path);
  }

  async function loadJsonFile(file: File) {
    loadFailed.value = false;
    try {
      const json = (await decodeJsonFile(await file.arrayBuffer())) as PatternJSON | DiagramJSON | SequenceJSON;
      callbacks.onLoadStart();
      store.setSaveFilename(file.name);
      loadIntoStore(json);
      callbacks.onClose();
    } catch (error) {
      loadFailed.value = true;
      console.error("Could not open the diagram file:", error);
    }
  }

  return { loadFailed, openDiagramSource, loadJsonFile };
}
