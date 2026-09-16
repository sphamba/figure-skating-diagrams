<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "openvue/button";
import Tag from "openvue/tag";
import ConfirmDialog from "openvue/confirmdialog";
import { useConfirm } from "openvue/useconfirm";
import { useRouter } from "vue-router";
import DiagramTree, { type DiagramTreeSource } from "@/components/DiagramTree.vue";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";
import type { PatternJSON } from "@/engine/pattern";
import type { DiagramJSON } from "@/engine/diagram";
import type { SequenceJSON } from "@/engine/sequence";

const props = defineProps<{ mode: "home" | "editor" }>();

// The parent pauses the playback before the new diagram reaches the store, as before.
const emit = defineEmits<{ "load-start": []; close: [] }>();

const isEditor = computed(() => props.mode === "editor");

const router = useRouter();
const store = useSequenceEditorStore();
const confirm = useConfirm();

const isUnsaved = computed(() => store.isUnsaved());
const loadFailed = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

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
    store.loadFromJSON({ name: "Diagram", sequences: [json] });
  } else {
    store.loadFromJSON(json);
  }
}

function navigate(path: string) {
  if (router) {
    void router.push(path);
    return;
  }
  // The hash history makes the location hash a valid fallback outside a router app.
  window.location.hash = path;
}

function openFile() {
  fileInput.value?.click();
}

function openFileWithGuard() {
  if (!store.isUnsaved()) {
    openFile();
    return;
  }
  confirm.require({
    group: "diagram-sidebar-open-file",
    header: "Unsaved changes",
    message: "The current diagram has unsaved changes. Open the new file and lose them?",
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Open",
    acceptProps: { severity: "warning" },
    rejectProps: { severity: "secondary", text: true },
    accept: () => openFile(),
  });
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  loadFailed.value = false;
  try {
    const json = JSON.parse(await file.text()) as PatternJSON | DiagramJSON | SequenceJSON;
    emit("load-start");
    loadIntoStore(json);
    emit("close");
  } catch (error) {
    loadFailed.value = true;
    console.error("Could not open the diagram file:", error);
  } finally {
    input.value = "";
  }
}

async function loadDiagramSource({ path }: DiagramTreeSource) {
  loadFailed.value = false;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = JSON.parse(await response.text()) as PatternJSON | DiagramJSON | SequenceJSON;
    emit("load-start");
    loadIntoStore(json);
    emit("close");
  } catch (error) {
    loadFailed.value = true;
    console.error("Could not open the diagram file:", error);
  }
}

function openDiagramSource(source: DiagramTreeSource) {
  if (!store.isUnsaved()) {
    void loadDiagramSource(source);
    return;
  }
  confirm.require({
    group: "diagram-sidebar-open-tree",
    header: "Unsaved changes",
    message: "The current diagram has unsaved changes. Open the new diagram and lose them?",
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Open",
    acceptProps: { severity: "warning" },
    rejectProps: { severity: "secondary", text: true },
    accept: () => {
      void loadDiagramSource(source);
    },
  });
}

function downloadFile() {
  const blob = new Blob([store.toJSON()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "diagram.json";
  anchor.click();
  URL.revokeObjectURL(url);
  store.markSaved();
  emit("close");
}

function confirmNew() {
  const unsaved = !store.isUnsaved() ? "New diagram" : "Unsaved changes";
  const message = store.isUnsaved()
    ? "The current diagram has unsaved changes. Create a new diagram and lose them?"
    : "Create a new diagram? The current diagram will be lost.";
  confirm.require({
    group: "diagram-sidebar-new",
    header: unsaved,
    message,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Create",
    acceptProps: { severity: "warning" },
    rejectProps: { severity: "secondary", text: true },
    accept: () => {
      store.clear();
      emit("close");
    },
  });
}

function openEditor() {
  navigate("/editor");
}

function leaveEditor() {
  if (!store.isUnsaved()) {
    navigate("/");
    return;
  }
  confirm.require({
    group: "diagram-sidebar-leave",
    header: "Unsaved changes",
    message: "The current diagram has unsaved changes. Leave the editor and lose them?",
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Leave",
    acceptProps: { severity: "warning" },
    rejectProps: { severity: "secondary", text: true },
    accept: () => navigate("/"),
  });
}
</script>

<template>
  <div class="diagram-sidebar__files">
    <Tag
      v-if="isEditor"
      :value="isUnsaved ? 'Unsaved changes' : 'Saved'"
      :severity="isUnsaved ? 'warn' : 'success'"
      class="diagram-sidebar__unsaved-tag"
    />
    <DiagramTree class="w-full" @select="openDiagramSource" />
    <small v-if="loadFailed" class="diagram-sidebar__load-error">
      The diagram could not be opened. Check that the json file is valid.
    </small>
    <Button label="Load JSON" icon="pi pi-folder-open" class="w-full" severity="secondary" @click="openFileWithGuard" />
    <template v-if="isEditor">
      <Button label="Download JSON" icon="pi pi-download" class="w-full" severity="secondary" @click="downloadFile" />
      <Button label="New" icon="pi pi-plus" class="w-full" severity="secondary" @click="confirmNew" />
      <Button label="Leave editor" icon="pi pi-arrow-left" class="w-full" @click="leaveEditor" />
    </template>
    <Button v-else label="Open in editor" icon="pi pi-pencil" class="w-full" @click="openEditor" />
    <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFileSelected" />
    <ConfirmDialog group="diagram-sidebar-open-file" />
    <ConfirmDialog group="diagram-sidebar-open-tree" />
    <ConfirmDialog group="diagram-sidebar-new" />
    <ConfirmDialog group="diagram-sidebar-leave" />
  </div>
</template>

<style scoped lang="scss">
.diagram-sidebar__files {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.diagram-sidebar__unsaved-tag {
  align-self: flex-start;
}
</style>
