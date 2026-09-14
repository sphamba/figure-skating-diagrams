<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "openvue/button";
import Checkbox from "openvue/checkbox";
import Card from "openvue/card";
import Tag from "openvue/tag";
import Fieldset from "openvue/fieldset";
import Listbox from "openvue/listbox";
import ToggleSwitch from "openvue/toggleswitch";
import Splitter from "openvue/splitter";
import SplitterPanel from "openvue/splitterpanel";
import SelectButton from "openvue/selectbutton";
import Slider from "openvue/slider";
import ConfirmDialog from "openvue/confirmdialog";
import { useConfirm } from "openvue/useconfirm";
import DiagramTree, { type DiagramTreeSource } from "@/components/DiagramTree.vue";
import TimeSyncPane from "@/components/TimeSyncPane.vue";
import { textColorFor } from "@/utils/contrast";
import { Editor } from "@/engine/sequenceEditor/editor";
import type { PatternJSON } from "@/engine/pattern";
import { earliestTimeKeyframeSeconds, fullTimeExtentSeconds, type DiagramJSON } from "@/engine/diagram";
import type { Sequence, SequenceJSON, FootKey } from "@/engine/sequence";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";
import { useMediaQuery } from "@/composables/useMediaQuery";
import { useVideoTimestamp } from "@/composables/useVideoTimestamp";
import { usePlaybackSpeed } from "@/composables/usePlaybackSpeed";

const canvasRef = ref<HTMLCanvasElement | null>(null);

const scaleElements = ref(true);

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
const fileInput = ref<HTMLInputElement | null>(null);

function isPattern(json: PatternJSON | DiagramJSON | SequenceJSON): json is PatternJSON {
  return Array.isArray((json as PatternJSON).sequences);
}

function isSequenceJSON(json: PatternJSON | DiagramJSON | SequenceJSON): json is SequenceJSON {
  return "path" in json && "keyframes" in json;
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
    group: "home-save",
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
    resetPlaybackSpeed();
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
  } finally {
    input.value = "";
  }
}

async function loadDiagramSource({ path }: DiagramTreeSource) {
  loadFailed.value = false;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const json = JSON.parse(text) as PatternJSON | DiagramJSON | SequenceJSON;
    resetPlaybackSpeed();
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
const {
  speed: playbackSpeed,
  options: playbackSpeedOptions,
  apply: applyPlaybackSpeed,
  reset: resetPlaybackSpeed,
} = usePlaybackSpeed(videoRef);
const {
  seconds: videoTime,
  setTimestamp,
  playing,
  play: playAnimation,
  pause: pauseAnimation,
} = useVideoTimestamp(videoRef, {
  speed: playbackSpeed,
  extent: () => fullTimeExtentSeconds(store.getDiagram().sequences, getBpm()),
});

function onVideoError() {
  if (videoSet.value) videoStatus.value = "invalid";
}

function onVideoLoad() {
  videoStatus.value = "valid";
  applyPlaybackSpeed();
  const earliest = earliestTimeKeyframeSeconds(store.getDiagram());
  if (earliest !== null) setTimestamp(earliest);
}

watch(
  videoUrl,
  (value) => {
    videoStatus.value = value.trim() !== "" ? "pending" : "empty";
    pauseAnimation();
  },
  { immediate: true },
);

function togglePlayback() {
  if (playing.value) pauseAnimation();
  else playAnimation();
}

let resumeAfterScrub = false;

function jumpToStart() {
  const bounds = fullTimeExtentSeconds(store.getDiagram().sequences, getBpm());
  if (bounds) {
    setTimestamp(bounds[0]);
    return;
  }
  setTimestamp(earliestTimeKeyframeSeconds(store.getDiagram()) ?? 0);
}

let editor: Editor | null = null;

const drawRange = computed({
  get: () => store.getDrawRange(),
  set: (value) => store.setDrawRange(value),
});

watch(
  drawRange,
  (value) => {
    if (!editor) return;
    editor.drawRange = value;
    editor.requestDraw();
  },
  { immediate: true },
);

watch(
  scaleElements,
  (value) => {
    if (editor) {
      editor.scaleElements = value;
      editor.draw();
    }
  },
  { immediate: true },
);

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
  const sidebarSpace = !isMobile.value && sidebarOpen.value ? 360 : 0;
  return (viewportWidth.value - sidebarSpace) / viewportHeight.value > 1 ? "horizontal" : "vertical";
});

function updateViewportSizes() {
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
}

// The player can appear after mount, so the splitter re-mounts to re-compute the panel sizes.
const splitKey = computed(() => `${splitLayout.value}-${videoSet.value}`);

function createEditor() {
  if (!canvasRef.value) return;
  const editorInstance = new Editor(canvasRef.value, sequences.value);
  editor = editorInstance;
  editorInstance.mode = "view";
  editorInstance.scaleElements = scaleElements.value;
  editorInstance.drawRange = store.getDrawRange();
  editorInstance.setHiddenSequences(hiddenSequenceSet.value);
  editorInstance.onVideoTimeChange = (seconds) => setTimestamp(seconds);
  editorInstance.onTimeScrubStart = () => {
    if (!playing.value) return;
    resumeAfterScrub = true;
    pauseAnimation();
  };
  editorInstance.onTimeScrubEnd = () => {
    if (!resumeAfterScrub) return;
    resumeAfterScrub = false;
    playAnimation();
  };
  editorInstance.activeSequence = activeSequence.value;
  editorInstance.bpm = getBpm();
  editorInstance.videoTimeSeconds = videoTime.value;
}

watch(
  canvasRef,
  (element, previous) => {
    if (previous !== element) {
      editor?.destroy();
      editor = null;
    }
    if (element && !editor) createEditor();
  },
  { flush: "post" },
);

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

const bpm = computed(() => getBpm());

const visibleSequences = computed(() => sequences.value.filter((sequence) => store.isVisible(sequence)));

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
            <Button
              label="Load JSON"
              icon="pi pi-folder-open"
              class="w-full"
              severity="secondary"
              @click="openFileWithGuard"
            />
            <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFileSelected" />
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
            <template v-if="diagramBpm !== undefined">
              <label class="home-view__mode-label">BPM</label>
              <span class="home-view__value">{{ diagramBpm }}</span>
            </template>
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
                      :style="{ color: textColorFor(sequenceInfos.get(option)?.[swatch.footKey] ?? '#ffffff') }"
                      >{{ swatch.letter }}</span
                    >
                  </span>
                </span>
                <span class="home-view__sequence-name">{{ sequenceInfos.get(option)?.name }}</span>
              </template>
            </Listbox>
          </div>

          <Fieldset legend="View parameters" toggleable class="home-view__help">
            <div class="home-view__scale-checkbox">
              <Checkbox v-model="scaleElements" binary input-id="scale-elements-zoom" />
              <label for="scale-elements-zoom">Scale elements with zoom</label>
            </div>
            <label class="home-view__mode-label home-view__view-param-label">Draw range</label>
            <div class="home-view__slider-param">
              <span class="home-view__slider-label">short</span>
              <Slider
                v-model="drawRange"
                :min="0.001"
                :max="1"
                :step="0.001"
                aria-label="Draw range"
                class="home-view__slider"
              />
              <span class="home-view__slider-label">long</span>
            </div>
          </Fieldset>

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
            @loadeddata="onVideoLoad"
            @error="onVideoError"
          ></video>
        </SplitterPanel>
        <SplitterPanel class="home-view__canvas-pane" :min-size="20">
          <div class="home-view__canvas-area">
            <div class="home-view__floating-stack">
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
              <div class="home-view__floating">
                <Button
                  icon="pi pi-step-backward"
                  aria-label="Back to the earliest time"
                  severity="secondary"
                  rounded
                  size="small"
                  @click="jumpToStart"
                />
                <Button
                  :icon="playing ? 'pi pi-pause' : 'pi pi-play'"
                  :aria-label="playing ? 'Pause the animation' : 'Play the animation'"
                  severity="secondary"
                  rounded
                  size="small"
                  @click="togglePlayback"
                />
                <SelectButton
                  v-model="playbackSpeed"
                  :options="playbackSpeedOptions"
                  option-label="label"
                  option-value="value"
                  :allow-empty="false"
                  size="small"
                  rounded
                />
              </div>
            </div>
            <canvas ref="canvasRef" class="home-view__canvas-element"></canvas>
          </div>
          <TimeSyncPane :sequences="visibleSequences" :time-seconds="videoTime" :bpm="bpm" />
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

.home-view__scale-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.home-view__slider-param {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.home-view__slider-label {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  flex-shrink: 0;
}

.home-view__view-param-label {
  margin-top: 0.75rem;
}

.home-view__slider {
  flex: 1;
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
  position: relative;
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
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: white;
}

.home-view__canvas-area {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

.home-view__floating-stack {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.home-view__floating {
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
