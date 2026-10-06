<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import Button from "openvue/button";
import Dialog from "openvue/dialog";
import Tag from "openvue/tag";
import ConfirmDialog from "openvue/confirmdialog";
import { useConfirm } from "openvue/useconfirm";
import { useToast } from "openvue/usetoast";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import DiagramTree, { type DiagramTreeSource } from "@/components/DiagramTree.vue";
import { decodeJsonFile, encodeJsonFile, gzipFileName } from "@/utils/jsonGzip";
import { listSavedDiagrams, loadSavedDiagram, saveSavedDiagram, fetchBundledDiagram } from "@/utils/diagramLibrary";
import { buildSharePathUrl, buildShareUrl, SHARE_URL_MAX_CHARS } from "@/utils/shareUrl";
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
const libraryOpen = ref(false);
const libraryRefresh = ref(0);
const fileInput = ref<HTMLInputElement | null>(null);
const shareDialogOpen = ref(false);
const shareDialogUrl = ref("");
const shareDialogTextarea = ref<HTMLTextAreaElement | null>(null);
const toast = useToast();

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
    const json = (await decodeJsonFile(await file.arrayBuffer())) as PatternJSON | DiagramJSON | SequenceJSON;
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

async function loadDiagramSource(path: string) {
  loadFailed.value = false;
  try {
    const json = (await fetchBundledDiagram(path)) as PatternJSON | DiagramJSON | SequenceJSON;
    emit("load-start");
    store.setSaveFilename(path.split("/").pop() ?? "");
    loadIntoStore(json);
    // Only a full diagram is shareable by path, and the load clears the origin,
    // so the origin travels after it.
    if (isPattern(json)) store.setBundledPath(path);
    emit("close");
  } catch (error) {
    loadFailed.value = true;
    console.error("Could not open the diagram file:", error);
  }
}

// The unsaved guard runs when the library dialog opens, not on selection.
function openDiagramSource(source: DiagramTreeSource) {
  if (source.source === "saved") void openSavedDiagram(source.name);
  else void loadDiagramSource(source.path);
}

async function openSavedDiagram(name: string) {
  loadFailed.value = false;
  try {
    const json = await loadSavedDiagram(name);
    if (json === null) throw new Error(`No saved diagram named "${name}".`);
    emit("load-start");
    store.setSaveFilename(name);
    loadIntoStore(json as PatternJSON | DiagramJSON | SequenceJSON);
    libraryOpen.value = false;
    emit("close");
  } catch {
    loadFailed.value = true;
  }
}

function openLibrary() {
  if (!store.isUnsaved()) {
    libraryOpen.value = true;
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
      libraryOpen.value = true;
    },
  });
}

async function writeToLibrary(name: string) {
  const ok = await saveSavedDiagram(name, store.toJSON());
  if (!ok) {
    toast.add({ severity: "error", summary: t("files.saveError"), life: 6000 });
    return;
  }
  toast.add({ severity: "success", summary: t("files.savedToast"), life: 4000 });
  store.markSaved();
  store.setSaveFilename(name);
  libraryRefresh.value++;
}

async function saveToLibrary() {
  const name = store.getDiagram().name.trim() || t("files.defaultDiagramName");
  if (!(await listSavedDiagrams()).includes(name)) {
    await writeToLibrary(name);
    return;
  }
  confirm.require({
    group: "diagram-sidebar-save-overwrite",
    header: t("files.confirm.overwriteHeader"),
    message: t("files.confirm.overwriteMessage", { name }),
    icon: "pi pi-exclamation-triangle",
    rejectLabel: t("files.confirm.cancel"),
    acceptLabel: t("files.confirm.overwrite"),
    acceptProps: { severity: "warning" },
    rejectProps: { severity: "secondary", text: true },
    accept: () => void writeToLibrary(name),
  });
}

async function downloadFile() {
  const blob = await encodeJsonFile(store.toJSON());
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = gzipFileName(store.getSaveFilename());
  anchor.click();
  URL.revokeObjectURL(url);
  store.markSaved();
  emit("close");
}

async function shareLink() {
  shareDialogOpen.value = false;
  const bundledPath = store.getBundledPath();
  const json = store.toJSON();
  const pathShare = bundledPath === null ? null : buildSharePathUrl(bundledPath);
  let url: string;
  let chars: number;
  try {
    ({ url, chars } = pathShare ?? (await buildShareUrl(json)));
  } catch (error) {
    toast.add({ severity: "error", summary: t("files.shareError"), life: 6000 });
    console.error("Could not build the share link:", error);
    return;
  }
  // A path link is always short, so only the inline payload can exceed the limit.
  if (pathShare === null && chars > SHARE_URL_MAX_CHARS) {
    toast.add({ severity: "error", summary: t("files.shareTooBig"), life: 6000 });
    return;
  }
  const title = store.diagram.name;
  if (typeof navigator.share !== "undefined" && navigator.canShare?.({ url })) {
    try {
      await navigator.share({ url, title });
      return;
    } catch (error) {
      // Chrome reports a missing share backend the same way as a user cancel,
      // so only a cancelled message stops the clipboard fallback.
      if (error instanceof DOMException && error.name === "AbortError" && /cancell?ed/i.test(error.message)) return;
      console.warn("navigator.share failed, falling back to the clipboard:", error);
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.add({ severity: "success", summary: t("files.shareCopied"), life: 4000 });
  } catch (error) {
    console.error("Could not share or copy the link:", error);
    shareDialogUrl.value = url;
    shareDialogOpen.value = true;
  }
}

async function copyShareDialogUrl() {
  try {
    await navigator.clipboard.writeText(shareDialogUrl.value);
    shareDialogOpen.value = false;
    toast.add({ severity: "success", summary: t("files.shareCopied"), life: 4000 });
  } catch (error) {
    console.error("Could not copy the link:", error);
  }
}

watch(shareDialogOpen, async (open) => {
  if (!open) return;
  await nextTick();
  // The Dialog focuses its close button in onAfterEnter, so the select lands
  // after it and on the autofocus target.
  requestAnimationFrame(() => {
    shareDialogTextarea.value?.focus();
    shareDialogTextarea.value?.select();
  });
});

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
    <DiagramTree
      v-model:visible="libraryOpen"
      :refresh-key="libraryRefresh"
      @open-request="openLibrary"
      @select="openDiagramSource"
    />
    <Button :label="$t('files.save')" icon="pi pi-save" class="w-full" severity="secondary" @click="saveToLibrary" />
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
      <Button
        :label="$t('files.shareLink')"
        icon="pi pi-share-alt"
        class="w-full"
        severity="secondary"
        @click="shareLink"
      />
      <Button :label="$t('files.new')" icon="pi pi-plus" class="w-full" severity="secondary" @click="confirmNew" />
      <Button :label="$t('files.leaveEditor')" icon="pi pi-arrow-left" class="w-full" @click="leaveEditor" />
    </template>
    <Button v-else :label="$t('files.openInEditor')" icon="pi pi-pencil" class="w-full" @click="openEditor" />
    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json,.gz,application/gzip"
      hidden
      @change="onFileSelected"
    />
    <ConfirmDialog group="diagram-sidebar-open-file" />
    <ConfirmDialog group="diagram-sidebar-open-library" />
    <ConfirmDialog group="diagram-sidebar-save-overwrite" />
    <ConfirmDialog group="diagram-sidebar-new" />
    <ConfirmDialog group="diagram-sidebar-leave" />
    <Dialog
      v-model:visible="shareDialogOpen"
      modal
      :header="t('files.shareDialogTitle')"
      class="diagram-sidebar__share-dialog"
    >
      <p class="diagram-sidebar__share-dialog__instructions">{{ t("files.shareDialogInstructions") }}</p>
      <textarea
        ref="shareDialogTextarea"
        class="diagram-sidebar__share-dialog__url"
        :value="shareDialogUrl"
        rows="3"
        readonly
        autofocus
      ></textarea>
      <template #footer>
        <Button :label="$t('files.close')" severity="secondary" @click="shareDialogOpen = false" />
        <Button :label="$t('files.shareDialogCopy')" @click="copyShareDialogUrl" />
      </template>
    </Dialog>
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
