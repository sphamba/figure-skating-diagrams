<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "openvue/button";
import Tag from "openvue/tag";
import ConfirmDialog from "openvue/confirmdialog";
import { useConfirm } from "openvue/useconfirm";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
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
const { t } = useI18n();

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
    store.loadFromJSON({ name: t("files.defaultDiagramName"), sequences: [json] });
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
    header: t("files.confirm.unsavedHeader"),
    message: t("files.confirm.openFileMessage"),
    icon: "pi pi-exclamation-triangle",
    rejectLabel: t("files.confirm.cancel"),
    acceptLabel: t("files.confirm.open"),
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
    store.setSaveFilename(file.name);
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
    store.setSaveFilename(path.split("/").pop() ?? "");
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
    header: t("files.confirm.unsavedHeader"),
    message: t("files.confirm.openTreeMessage"),
    icon: "pi pi-exclamation-triangle",
    rejectLabel: t("files.confirm.cancel"),
    acceptLabel: t("files.confirm.open"),
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
  anchor.download = store.getSaveFilename();
  anchor.click();
  URL.revokeObjectURL(url);
  store.markSaved();
  emit("close");
}

function confirmNew() {
  const unsaved = !store.isUnsaved() ? t("files.confirm.newDiagramHeader") : t("files.confirm.unsavedHeader");
  const message = store.isUnsaved() ? t("files.confirm.newMessageUnsaved") : t("files.confirm.newMessageEmpty");
  confirm.require({
    group: "diagram-sidebar-new",
    header: unsaved,
    message,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: t("files.confirm.cancel"),
    acceptLabel: t("files.confirm.create"),
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
    header: t("files.confirm.unsavedHeader"),
    message: t("files.confirm.leaveMessage"),
    icon: "pi pi-exclamation-triangle",
    rejectLabel: t("files.confirm.cancel"),
    acceptLabel: t("files.confirm.leave"),
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
      :value="isUnsaved ? t('files.unsaved') : t('files.saved')"
      :severity="isUnsaved ? 'warn' : 'success'"
      class="diagram-sidebar__unsaved-tag"
    />
    <DiagramTree class="w-full" @select="openDiagramSource" />
    <small v-if="loadFailed" class="diagram-sidebar__load-error">
      {{ $t("files.loadError") }}
    </small>
    <Button
      :label="$t('files.loadJson')"
      icon="pi pi-folder-open"
      class="w-full"
      severity="secondary"
      @click="openFileWithGuard"
    />
    <template v-if="isEditor">
      <Button
        :label="$t('files.downloadJson')"
        icon="pi pi-download"
        class="w-full"
        severity="secondary"
        @click="downloadFile"
      />
      <Button :label="$t('files.new')" icon="pi pi-plus" class="w-full" severity="secondary" @click="confirmNew" />
      <Button :label="$t('files.leaveEditor')" icon="pi pi-arrow-left" class="w-full" @click="leaveEditor" />
    </template>
    <Button v-else :label="$t('files.openInEditor')" icon="pi pi-pencil" class="w-full" @click="openEditor" />
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
