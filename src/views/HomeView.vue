<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "openvue/button";
import Card from "openvue/card";
import Tag from "openvue/tag";
import Fieldset from "openvue/fieldset";
import Listbox from "openvue/listbox";
import ToggleSwitch from "openvue/toggleswitch";
import Splitter from "openvue/splitter";
import SplitterPanel from "openvue/splitterpanel";
import ConfirmDialog from "openvue/confirmdialog";
import { useConfirm } from "openvue/useconfirm";
import DiagramTree, { type DiagramTreeSource } from "@/components/DiagramTree.vue";
import { Editor } from "@/engine/sequenceEditor/editor";
import type { PatternJSON } from "@/engine/pattern";
import type { DiagramJSON } from "@/engine/diagram";
import type { Sequence, SequenceJSON, FootKey } from "@/engine/sequence";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";
import { useMediaQuery } from "@/composables/useMediaQuery";
import { useVideoTimestamp } from "@/composables/useVideoTimestamp";

const canvasRef = ref<HTMLCanvasElement | null>(null);

const isMobile = useMediaQuery("(max-width: 767.98px)");
const sidebarOpen = ref(true);

watch(isMobile, (mobile) => {
  sidebarOpen.value = !mobile;
});

const store = useSequenceEditorStore();
const confirm = useConfirm();

const sequences = computed(() => store.getSequences());
const activeSequence = computed(() => store.getActiveSequence());
const hiddenSequenceSet = computed(() => new Set(sequences.value.filter((sequence) => !store.isVisible(sequence))));
const diagramName = computed(() => store.getDiagram().name);
const diagramBpm = computed(() => store.getDiagram().bpm);

const loadFailed = ref(false);

function isPattern(json: PatternJSON | DiagramJSON | SequenceJSON): json is PatternJSON {
  return Array.isArray((json as PatternJSON).sequences);
}

function isSequenceJSON(json: PatternJSON | DiagramJSON | SequenceJSON): json is SequenceJSON {
  return "path" in json && "keyframes" in json;
}

async function loadDiagramSource({ path }: DiagramTreeSource) {
  loadFailed.value = false;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const json = JSON.parse(text) as PatternJSON | DiagramJSON | SequenceJSON;
    if (isPattern(json)) {
      store.loadFromJSON(json);
    } else if (isSequenceJSON(json)) {
      store.loadFromJSON({ name: "Diagram", sequences: [json] });
    } else {
      store.loadFromJSON(json);
    }
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
    group: "home-save",
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

const videoUrl = computed(() => store.getDiagram().videoUrl ?? "");
const videoSet = computed(() => videoUrl.value.trim() !== "");
const videoStatus = ref<"empty" | "pending" | "valid" | "invalid">("empty");
const videoValid = computed(() => videoStatus.value === "valid");
const videoRef = ref<HTMLVideoElement | null>(null);
const { seconds: videoTime, setTimestamp } = useVideoTimestamp(videoRef);

function onVideoError() {
  if (videoSet.value) videoStatus.value = "invalid";
}

watch(
  videoUrl,
  (value) => {
    videoStatus.value = value.trim() !== "" ? "pending" : "empty";
  },
  { immediate: true },
);

let editor: Editor | null = null;

function getBpm(): number {
  return store.getDiagram().bpm || 120;
}

watch(
  videoValid,
  (valid) => {
    if (!valid || !editor) return;
    editor.videoTimeSeconds = videoTime.value;
    editor.requestDraw();
  },
  { immediate: true },
);

const sequenceInfos = computed(
  () =>
    new Map(
      store
        .getSequences()
        .map(
          (sequence) =>
            [sequence, { name: sequence.name, footL: sequence.traceColorL, footR: sequence.traceColorR }] as const,
        ),
    ),
);

const footSwatches = [
  { footKey: "footL" as FootKey, letter: "L" },
  { footKey: "footR" as FootKey, letter: "R" },
];

function swatchTextColor(color: string): string {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return "white";
  const channels = [0, 2, 4].map((offset) => parseInt(match[1]!.slice(offset, offset + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.35 ? "black" : "white";
}

const selectedSequence = computed({
  get: () => activeSequence.value,
  set: (value) => {
    if (value) store.setActiveSequence(value);
  },
});

type HelpItem = { keys: string[]; description: string };

const helpItems: HelpItem[] = [
  { keys: ["wheel"], description: "zoom" },
  { keys: ["left drag"], description: "move the view" },
  { keys: ["right drag"], description: "move the view" },
  { keys: ["two fingers"], description: "pinch to zoom and drag to move the view" },
  { keys: ["one finger"], description: "same as a left click" },
];

const viewportWidth = ref(0);
const viewportHeight = ref(0);

const splitLayout = computed(() => {
  // The docked sidebar takes space from the horizontal screen ratio, so it is
  // subtracted before the 1:1 threshold decides the split direction.
  const sidebarSpace = !isMobile.value && sidebarOpen.value ? 360 : 0;
  return (viewportWidth.value - sidebarSpace) / viewportHeight.value > 1 ? "horizontal" : "vertical";
});

function updateViewportSizes() {
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
}

// The player can appear after mount, so the splitter re-mounts to re-compute the panel sizes.
const splitKey = computed(() => `${splitLayout.value}-${videoSet.value}`);

onMounted(() => {
  if (!canvasRef.value) return;
  if (sequences.value.length === 0) return;
  const editorInstance = new Editor(canvasRef.value, sequences.value);
  editor = editorInstance;
  editorInstance.mode = "view";
  editorInstance.setHiddenSequences(hiddenSequenceSet.value);
  editorInstance.onVideoTimeChange = (seconds) => setTimestamp(seconds);
  editorInstance.activeSequence = activeSequence.value;
  editorInstance.bpm = getBpm();
  editorInstance.videoTimeSeconds = videoTime.value;
});

let previousSequences: Sequence[] = [];
watch(sequences, (list) => {
  const sameMembers = list.length === previousSequences.length && list.every((s, i) => s === previousSequences[i]);
  previousSequences = list;
  if (!sameMembers && editor) editor.setSequences(list);
});

watch(hiddenSequenceSet, (next) => {
  editor?.setHiddenSequences(next);
});

watch([videoTime, activeSequence] as const, () => {
  if (!editor) return;
  editor.videoTimeSeconds = videoTime.value;
  editor.activeSequence = activeSequence.value;
  editor.bpm = getBpm();
  editor.requestDraw();
});

onMounted(() => {
  updateViewportSizes();
  window.addEventListener("resize", updateViewportSizes);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewportSizes);
});

onBeforeUnmount(() => {
  editor?.destroy();
  editor = null;
});
</script>

<template>
  <div class="home-view">
    <aside v-if="!isMobile || sidebarOpen" class="home-view__sidebar">
      <Card class="home-view__panel">
        <template #title>
          <div class="home-view__panel-title">
            <span>Diagram viewer</span>
            <Button
              v-if="isMobile"
              icon="pi pi-times"
              aria-label="Close panel"
              severity="secondary"
              text
              rounded
              size="small"
              @click="sidebarOpen = false"
            />
          </div>
        </template>
        <template #content>
          <div class="home-view__actions">
            <DiagramTree class="w-full" @select="openDiagramSource" />
            <small v-if="loadFailed" class="home-view__load-error">
              The diagram could not be opened. Check that the json file is valid.
            </small>
          </div>

          <div class="home-view__actions">
            <label class="home-view__mode-label">Diagram name</label>
            <span class="home-view__value">{{ diagramName }}</span>
            <template v-if="videoSet">
              <label class="home-view__mode-label">Video URL</label>
              <a class="home-view__value home-view__link" :href="videoUrl" target="_blank" rel="noreferrer">
                {{ videoUrl }}
                <i class="pi pi-external-link pi-sm" aria-label="Open the video in a new tab" />
              </a>
            </template>
            <label class="home-view__mode-label">BPM</label>
            <span class="home-view__value">{{ diagramBpm }}</span>
          </div>

          <div class="home-view__actions">
            <label class="home-view__mode-label">Sequences</label>
            <Listbox
              v-model="selectedSequence"
              :options="sequences"
              option-label="name"
              class="home-view__sequence-list"
            >
              <template #option="{ option }">
                <ToggleSwitch
                  :model-value="store.isVisible(option)"
                  :aria-label="store.isVisible(option) ? 'Hide sequence' : 'Show sequence'"
                  @update:model-value="store.toggleVisible(option)"
                  @click.stop
                />
                <span class="home-view__swatches">
                  <span
                    v-for="swatch in footSwatches"
                    :key="swatch.footKey"
                    class="home-view__swatch-wrapper"
                    :style="{ background: sequenceInfos.get(option)?.[swatch.footKey] }"
                  >
                    <span
                      class="home-view__swatch-letter"
                      :style="{ color: swatchTextColor(sequenceInfos.get(option)?.[swatch.footKey] ?? '#ffffff') }"
                      >{{ swatch.letter }}</span
                    >
                  </span>
                </span>
                <span class="home-view__sequence-name">{{ sequenceInfos.get(option)?.name }}</span>
              </template>
            </Listbox>
          </div>

          <Fieldset legend="Input help" toggleable class="home-view__help">
            <ul class="home-view__hint">
              <li v-for="item in helpItems" :key="item.description" class="home-view__hint-item">
                <span class="home-view__hint-keys">
                  <template v-for="(key, index) in item.keys" :key="key">
                    <Tag :value="key" rounded />
                    <span v-if="index < item.keys.length - 1" class="home-view__hint-separator">+</span>
                  </template>
                </span>
                <span class="home-view__hint-desc">{{ item.description }}</span>
              </li>
            </ul>
          </Fieldset>
        </template>
      </Card>
    </aside>

    <ConfirmDialog group="home-save" />

    <div v-if="isMobile && sidebarOpen" class="home-view__backdrop" @click="sidebarOpen = false"></div>

    <div class="home-view__canvas">
      <Splitter
        :key="splitKey"
        :layout="splitLayout"
        :gutter-size="videoSet ? 10 : 0"
        class="home-view__splitter"
        :class="{ 'home-view__splitter--no-video': !videoSet }"
      >
        <SplitterPanel class="home-view__video-pane" :size="videoSet ? 40 : 0" :min-size="videoSet ? 10 : 0">
          <video
            v-if="videoSet"
            ref="videoRef"
            class="home-view__video"
            :src="videoUrl"
            controls
            playsinline
            @loadeddata="videoStatus = 'valid'"
            @error="onVideoError"
          ></video>
        </SplitterPanel>
        <SplitterPanel class="home-view__canvas-pane" :min-size="20">
          <div class="home-view__floating">
            <small v-if="videoStatus === 'invalid'" class="home-view__video-error">
              The video could not be loaded. Use a direct link to an .mp4 file.
            </small>
            <Button
              v-if="isMobile && !sidebarOpen"
              icon="pi pi-bars"
              aria-label="Open panel"
              severity="secondary"
              rounded
              @click="sidebarOpen = true"
            />
          </div>
          <canvas ref="canvasRef" class="home-view__canvas-element"></canvas>
        </SplitterPanel>
      </Splitter>
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-view {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
}

.home-view__sidebar {
  flex: 0 0 360px;
  width: 360px;
  height: 100%;
  overflow-y: auto;
}

.home-view__panel {
  border-radius: 0;
  min-height: 100%;
}

.home-view__panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.home-view__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.home-view__actions + .home-view__actions {
  margin-top: 1rem;
}

.home-view__mode-label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.home-view__value {
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.home-view__link {
  color: var(--p-primary-color);
  text-decoration: none;
}

.home-view__link:hover {
  text-decoration: underline;
}

.home-view__load-error {
  margin-top: 0.25rem;
  color: var(--p-form-field-invalid-hover-border-color);
}

.home-view__sequence-list {
  width: 100%;
}

.home-view__sequence-list :deep(.p-listbox-option) {
  width: 100%;
  padding-block: 0.2rem;
}

.home-view__sequence-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-view__swatches {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-inline: 0.25rem;
}

.home-view__swatch-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background-color: #ffffff;
}

.home-view__swatch-letter {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1;
  pointer-events: none;
  user-select: none;
}

.home-view__help {
  margin-top: 1rem;
}

.home-view__hint {
  margin: 0;
  padding: 0;
  list-style: none;
}

.home-view__hint-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.home-view__hint-keys {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.home-view__hint-separator {
  display: flex;
  align-items: center;
  color: var(--p-text-muted-color);
}

.home-view__hint-desc {
  color: var(--p-text-muted-color);
}

.home-view__canvas {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  position: relative;
  background: white;
}

.home-view__splitter {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: none;
  border-radius: 0;
  background: white;
}

.home-view__splitter--no-video :deep(.p-splitter-gutter) {
  display: none;
}

/* The splitter panels grow by default: pin the video panel when the url is empty. */
.home-view__splitter--no-video :deep(.home-view__video-pane) {
  flex-grow: 0;
  width: 0;
  min-width: 0;
}

.home-view__video-pane {
  display: flex;
  background: black;
  overflow: hidden;
}

.home-view__video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.home-view__canvas-pane {
  position: relative;
  overflow: hidden;
  background: white;
}

.home-view__floating {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 5;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.home-view__video-error {
  color: var(--p-form-field-invalid-hover-border-color);
  background: white;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.home-view__backdrop {
  position: absolute;
  inset: 0;
  z-index: 35;
  background: rgba(0, 0, 0, 0.4);
}

@media (max-width: 767.98px) {
  .home-view__sidebar {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 40;
    flex: none;
    width: min(360px, 85vw);
    box-shadow: 0.5rem 0 1.5rem rgba(0, 0, 0, 0.2);
  }
}

.home-view__canvas-element {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  cursor: default;
  touch-action: none;
}
</style>
