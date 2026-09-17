<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "openvue/button";
import SelectButton from "openvue/selectbutton";
import Splitter from "openvue/splitter";
import SplitterPanel from "openvue/splitterpanel";
import TimeSyncPane from "@/components/TimeSyncPane.vue";
import TrackingButton from "@/components/TrackingButton.vue";
import DiagramSidebar, { type HelpItem } from "@/components/DiagramSidebar.vue";
import { Editor } from "@/engine/sequenceEditor/editor";
import { earliestTimeKeyframeSeconds, fullTimeExtentSeconds } from "@/engine/diagram";
import type { Sequence } from "@/engine/sequence";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";
import { useMediaQuery } from "@/composables/useMediaQuery";
import { useVideoTimestamp } from "@/composables/useVideoTimestamp";
import { usePlaybackKeyToggle } from "@/composables/usePlaybackKeyToggle";
import { usePlaybackSpeed } from "@/composables/usePlaybackSpeed";

const canvasRef = ref<HTMLCanvasElement | null>(null);

const scaleElements = ref(true);
const showLabels = ref(true);

const isMobile = useMediaQuery("(max-width: 767.98px)");
const drawerOpen = ref(false);

const store = useSequenceEditorStore();

const sequences = computed(() => store.getSequences());
const activeSequence = computed(() => store.getActiveSequence());
const hiddenSequenceSet = computed(() => new Set(sequences.value.filter((sequence) => !store.isVisible(sequence))));

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

// A freshly loaded or created diagram snaps the timestamp back to the earliest
// timestamp in it. Regular detail edits trigger the store reactivity with the
// same diagram object, so the watch only fires on the identity change.
const seenDiagram = computed(() => store.getDiagram());
watch(seenDiagram, (diagram) => {
  const earliest = earliestTimeKeyframeSeconds(diagram);
  if (earliest !== null) setTimestamp(earliest);
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

function toggleTracking() {
  if (!editor) return;
  // The editor advances its own cycle: it starts tracking at the barycenter,
  // then each visible cursor, then back to the barycenter.
  editor.followTimeCursor();
}

usePlaybackKeyToggle(togglePlayback);

let resumeAfterScrub = false;

// Scroll/drag gestures on the elements pane act like a canvas time cursor scrub:
// pause the playback during the gesture, resume it when the gesture has settled.
function onPaneScrubStart() {
  if (!playing.value) return;
  resumeAfterScrub = true;
  pauseAnimation();
}

function onPaneScrubEnd() {
  if (!resumeAfterScrub) return;
  resumeAfterScrub = false;
  playAnimation();
}

function jumpToStart() {
  const bounds = fullTimeExtentSeconds(store.getDiagram().sequences, getBpm());
  if (bounds) {
    setTimestamp(bounds[0]);
    return;
  }
  setTimestamp(earliestTimeKeyframeSeconds(store.getDiagram()) ?? 0);
}

let editor: Editor | null = null;
const isTracking = ref(false);
const trackingStage = ref<"barycenter" | "cursor">("barycenter");

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

watch(
  showLabels,
  (value) => {
    if (editor) {
      editor.showLabels = value;
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

const helpItems: HelpItem[] = [
  { keys: ["left drag"], descriptions: ["move the view"] },
  { keys: ["right drag"], descriptions: ["move the view"] },
  { keys: ["wheel"], descriptions: ["zoom"] },
  { keys: ["one finger"], descriptions: ["same as a left click"] },
  { keys: ["two fingers"], descriptions: ["pinch to zoom and drag to move the view"] },
  { keys: ["space"], descriptions: ["toggle the playback"] },
];

const viewportWidth = ref(0);
const viewportHeight = ref(0);

const splitLayout = computed(() => {
  const sidebarSpace = !isMobile.value ? 360 : 0;
  return (viewportWidth.value - sidebarSpace) / viewportHeight.value > 1 ? "horizontal" : "vertical";
});

const splitterRoot = ref<{ $el?: HTMLElement | null } | null>(null);
const videoPaneSize = ref(40);
const PANE_SELECTOR = ".home-view__video-pane";

// The panel percentage does not map linearly to pixels, so the 16/9 size
// converges from the measured pane against the wanted target.
function updateVideoPaneSize(thenAgain = false) {
  if (!videoSet.value) {
    if (videoPaneSize.value !== 0) videoPaneSize.value = 0;
    return;
  }
  const root = splitterRoot.value?.$el ?? null;
  // The 16/9 ratio applies to any vertical split and to a mobile horizontal
  // split; only a desktop side-by-side split keeps the fixed 40%. A desktop
  // vertical split needs the measured root, so it waits for a next check.
  if (splitLayout.value === "horizontal" && !isMobile.value) {
    if (videoPaneSize.value !== 40) videoPaneSize.value = 40;
    return;
  }
  if (!root) return;
  const pane = root.querySelector<HTMLElement>(PANE_SELECTOR);
  if (!pane) return;
  const vertical = splitLayout.value === "vertical";
  const splitterW = root.clientWidth;
  const splitterH = root.clientHeight;
  if (splitterW <= 0 || splitterH <= 0) return;
  const target = vertical
    ? Math.min((splitterW * 9) / 16, splitterH / 2)
    : Math.min((splitterH * 16) / 9, splitterW / 2);
  const current = vertical ? pane.clientHeight : pane.clientWidth;
  if (Math.abs(current - target) <= 1.5) return;
  const previous = videoPaneSize.value;
  const next =
    previous <= 0.5 || current <= 2
      ? Math.min(95, Math.max(2, (target / (vertical ? splitterH : splitterW)) * 100 * 1.15))
      : Math.min(95, Math.max(2, (previous * target) / current));
  if (Math.abs(next - previous) < 0.05) return;
  videoPaneSize.value = next;
  if (thenAgain) {
    requestAnimationFrame(() => requestAnimationFrame(() => updateVideoPaneSize(true)));
  }
}

// Both pane bases sum to exactly 100 on any 16/9 split: no growth distortion.
const canvasPaneSize = computed(() =>
  videoSet.value && (splitLayout.value === "vertical" || isMobile.value) ? 100 - videoPaneSize.value : 50,
);

let splitterObserver: ResizeObserver | null = null;

watch(splitterRoot, async (root, previous) => {
  if (previous !== root) {
    splitterObserver?.disconnect();
    splitterObserver = null;
  }
  await nextTick();
  const el = root?.$el ?? null;
  if (el && !splitterObserver && typeof ResizeObserver !== "undefined") {
    splitterObserver = new ResizeObserver(() => updateVideoPaneSize(true));
    splitterObserver.observe(el);
  }
  updateVideoPaneSize(true);
});

watch([videoSet, isMobile, splitLayout], () => {
  updateVideoPaneSize(true);
});

onBeforeUnmount(() => {
  splitterObserver?.disconnect();
  splitterObserver = null;
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
  editorInstance.onTrackingChange = () => {
    isTracking.value = editorInstance.tracking;
    trackingStage.value = editorInstance.trackingStage === "cursor" ? "cursor" : "barycenter";
  };
  isTracking.value = editorInstance.tracking;
  trackingStage.value = editorInstance.trackingStage === "cursor" ? "cursor" : "barycenter";
  editorInstance.mode = "view";
  editorInstance.scaleElements = scaleElements.value;
  editorInstance.showLabels = showLabels.value;
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
    <DiagramSidebar
      v-model:open="drawerOpen"
      v-model:scale-elements="scaleElements"
      v-model:show-labels="showLabels"
      v-model:draw-range="drawRange"
      mode="home"
      :mobile="isMobile"
      :help-items="helpItems"
      :video-error="videoStatus === 'invalid'"
      @load-start="resetPlaybackSpeed"
    />

    <div class="home-view__main">
      <div class="home-view__splitter-wrap">
        <Splitter
          :key="splitKey"
          ref="splitterRoot"
          :layout="splitLayout"
          :gutter-size="videoSet ? 10 : 0"
          class="home-view__splitter"
          :class="{ 'home-view__splitter--no-video': !videoSet }"
        >
          <SplitterPanel class="home-view__video-pane" :size="videoPaneSize" :min-size="videoSet ? 10 : 0">
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
          <SplitterPanel class="home-view__canvas-pane" :size="canvasPaneSize" :min-size="20">
            <div class="home-view__canvas-area">
              <canvas ref="canvasRef" class="home-view__canvas-element"></canvas>
              <TrackingButton :active="isTracking" :mode="trackingStage" @toggle="toggleTracking" />
              <TimeSyncPane
                class="home-view__elements"
                :sequences="visibleSequences"
                :time-seconds="videoTime"
                :bpm="bpm"
                @seek="setTimestamp"
                @scrub-start="onPaneScrubStart"
                @scrub-end="onPaneScrubEnd"
              />
            </div>
          </SplitterPanel>
        </Splitter>
      </div>
      <div class="home-view__player">
        <Button
          v-if="isMobile"
          icon="pi pi-bars"
          aria-label="Open settings"
          severity="secondary"
          text
          rounded
          @click="drawerOpen = true"
        />
        <div class="home-view__player-controls">
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
            rounded
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
            aria-label="Playback speed"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-view {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.home-view__main {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}

.home-view__splitter-wrap {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.home-view__player {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0.375rem 0.75rem;
  border-top: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
}

/* The hamburger stays left; the controls group centers on the bar. */
.home-view__player-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 auto;
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
  overflow: hidden;
  background: white;
}

.home-view__canvas-area {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

/* The elements pane floats above the canvas, so its rows can change without
   resizing the canvas or the playback bar below. */
.home-view__elements {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  width: auto;
  z-index: 5;
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
