<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "openvue/button";
import Select from "openvue/select";
import Splitter from "openvue/splitter";
import SplitterPanel from "openvue/splitterpanel";
import TimeSyncPane from "@/components/TimeSyncPane.vue";
import DiagramLegend from "@/components/DiagramLegend.vue";
import TrackingButton from "@/components/TrackingButton.vue";
import DiagramSidebar, { type HelpItem } from "@/components/DiagramSidebar.vue";
import { useI18n } from "vue-i18n";
import { Editor } from "@/engine/sequenceEditor/editor";
import { earliestTimeKeyframeSeconds, fullTimeExtentSeconds } from "@/engine/diagram";
import type { Sequence } from "@/engine/sequence";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";
import { useAppearanceStore } from "@/stores/appearance";
import { useRoute, useRouter } from "vue-router";
import { decodeShareParam, decodeSharePath } from "@/utils/shareUrl";
import { fetchBundledDiagram } from "@/utils/diagramLibrary";
import type { DiagramJSON } from "@/engine/diagram";
import { useMediaQuery } from "@/composables/useMediaQuery";
import { useGuardedLibraryOpen } from "@/composables/useGuardedLibraryOpen";
import { useVideoTimestamp } from "@/composables/useVideoTimestamp";
import { usePlaybackKeyToggle } from "@/composables/usePlaybackKeyToggle";
import { usePlaybackLoop } from "@/composables/usePlaybackLoop";
import { usePlaybackSpeed } from "@/composables/usePlaybackSpeed";
import { useTimeCursorStepping } from "@/composables/useTimeCursorStepping";
import { useTimeCursorKeys } from "@/composables/useTimeCursorKeys";

const canvasRef = ref<HTMLCanvasElement | null>(null);

const isMobile = useMediaQuery("(max-width: 767.98px)");
const drawerOpen = ref(false);

const store = useSequenceEditorStore();
const appearance = useAppearanceStore();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { openLibrary } = useGuardedLibraryOpen();
const sharedLinkError = ref(false);

const sequences = computed(() => store.getSequences());
const activeSequence = computed(() => store.getActiveSequence());
const hiddenSequenceSet = computed(() => new Set(sequences.value.filter((sequence) => !store.isVisible(sequence))));

const videoUrl = computed(() => store.getDiagram().videoUrl ?? "");
const videoSet = computed(() => videoUrl.value.trim() !== "");
const videoStatus = ref<"empty" | "pending" | "valid" | "invalid">("empty");
const videoValid = computed(() => videoStatus.value === "valid");
const videoRef = ref<HTMLVideoElement | null>(null);

const backgroundImage = computed(() => store.getDiagram().backgroundImage);
const backgroundImageOpacity = computed(() => store.getDiagram().backgroundImageOpacity ?? 1);
const diagramSymmetric = computed(() => store.getDiagram().symmetric === true);

function getBpm(): number {
  return store.getDiagram().bpm || 120;
}

// The extent is a computed: the playback loop reads it once per frame, so the
// cached value avoids a full timing resolution at the frame rate.
const timeExtent = computed(() => fullTimeExtentSeconds(store.getDiagram().sequences, getBpm()));

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
  extent: () => timeExtent.value,
});
const {
  stage: loopStage,
  toggle: toggleLoop,
  reset: resetLoop,
  drawWindow: loopDrawWindow,
  bounds: loopBounds,
} = usePlaybackLoop(videoTime, playing, setTimestamp);
const loopAriaLabel = computed(() =>
  loopStage.value === "idle"
    ? t("player.loopA")
    : loopStage.value === "armed"
      ? t("player.loopB")
      : t("player.loopStop"),
);
const { step: stepTimeCursor } = useTimeCursorStepping(videoRef, {
  seconds: videoTime,
  setTimestamp,
  extent: () => timeExtent.value,
  hasVideo: () => videoSet.value,
});

// A freshly loaded or created diagram snaps the timestamp back to the earliest
// timestamp in it. Regular detail edits trigger the store reactivity with the
// same diagram object, so the watch only fires on the identity change.
const seenDiagram = computed(() => store.getDiagram());
watch(seenDiagram, (diagram) => {
  resetLoop();
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
    resetLoop();
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
useTimeCursorKeys(stepTimeCursor, () => !drawerOpen.value);

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
  const bounds = timeExtent.value;
  if (bounds) {
    setTimestamp(bounds[0]);
    return;
  }
  setTimestamp(earliestTimeKeyframeSeconds(store.getDiagram()) ?? 0);
}

let editor: Editor | null = null;
const isTracking = ref(false);
const trackingStage = ref<"barycenter" | "cursor">("barycenter");

// The pane above the canvas hides part of it, and its height depends on its
// content, so the editor reads it fresh at each fit.
const elementsPane = ref<InstanceType<typeof TimeSyncPane> | null>(null);
function paneElement(pane: unknown) {
  return (pane as { $el?: HTMLElement | null } | null)?.$el ?? null;
}
const occludedTop = () => paneElement(elementsPane.value)?.offsetHeight ?? 0;
let paneObserver: ResizeObserver | null = null;
watch(elementsPane, (pane) => {
  paneObserver?.disconnect();
  paneObserver = null;
  const el = paneElement(pane);
  // A vanished pane hides nothing anymore, so the rink recenters on the full canvas.
  if (!el) {
    editor?.refit();
    return;
  }
  if (typeof ResizeObserver === "undefined") return;
  paneObserver = new ResizeObserver(() => editor?.refit());
  paneObserver.observe(el);
});
onBeforeUnmount(() => paneObserver?.disconnect());

const shortDrawRange = computed({
  get: () => store.getShortDrawRange(),
  set: (value) => store.setShortDrawRange(value),
});

watch(
  shortDrawRange,
  (value) => {
    if (!editor) return;
    editor.shortDrawRange = value;
    editor.requestDraw();
  },
  { immediate: true },
);

// The loop stage changes the drawn window, so a paused toggle still repaints.
watch(loopStage, () => {
  editor?.requestDraw();
});

// The background image and its opacity live in the diagram, so the canvas editor follows the store here.
watch(
  backgroundImage,
  (dataUrl) => {
    editor?.setBackgroundImage(dataUrl ?? undefined);
  },
  { immediate: true },
);

watch(
  backgroundImageOpacity,
  (value) => {
    if (!editor) return;
    editor.backgroundImageOpacity = value;
    editor.requestDraw();
  },
  { immediate: true },
);

// The symmetric traces live in the diagram options, so the canvas editor follows the store here.
watch(
  diagramSymmetric,
  (value) => {
    if (!editor) return;
    editor.symmetric = value;
    editor.requestDraw();
  },
  { immediate: true },
);

watch(
  () => appearance.scaleElements,
  (value) => {
    if (editor) {
      editor.scaleElements = value;
      editor.draw();
    }
  },
  { immediate: true },
);

watch(
  () => appearance.showLabels,
  (value) => {
    if (editor) {
      editor.showLabels = value;
      editor.draw();
    }
  },
  { immediate: true },
);

watch(
  () => appearance.darkMode,
  (value) => {
    if (editor) {
      editor.darkMode = value;
      editor.draw();
    }
  },
  { immediate: true },
);

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
  { keys: ["leftDrag"], descriptions: ["moveView"] },
  { keys: ["rightDrag"], descriptions: ["moveView"] },
  { keys: ["wheel"], descriptions: ["zoom"] },
  { keys: ["oneFinger"], descriptions: ["moveView"] },
  { keys: ["twoFingers"], descriptions: ["pinchZoomDragView"] },
  { keys: ["space"], descriptions: ["togglePlayback"] },
  { keys: ["leftArrow"], descriptions: ["cursorBack"] },
  { keys: ["rightArrow"], descriptions: ["cursorForward"] },
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
  const editorInstance = new Editor(canvasRef.value, sequences.value, { occludedTop });
  editor = editorInstance;
  editorInstance.onTrackingChange = () => {
    isTracking.value = editorInstance.tracking;
    trackingStage.value = editorInstance.trackingStage === "cursor" ? "cursor" : "barycenter";
  };
  isTracking.value = editorInstance.tracking;
  trackingStage.value = editorInstance.trackingStage === "cursor" ? "cursor" : "barycenter";
  editorInstance.mode = "view";
  editorInstance.scaleElements = appearance.scaleElements;
  editorInstance.showLabels = appearance.showLabels;
  editorInstance.darkMode = appearance.darkMode;
  editorInstance.shortDrawRange = store.getShortDrawRange();
  editorInstance.loopDrawWindow = () => loopDrawWindow.value;
  editorInstance.loopTimeBounds = () => loopBounds.value;
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
  editorInstance.setBackgroundImage(backgroundImage.value ?? undefined);
  editorInstance.backgroundImageOpacity = backgroundImageOpacity.value;
  editorInstance.symmetric = diagramSymmetric.value;
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

watch(videoTime, (value) => {
  if (!editor) return;
  editor.videoTimeSeconds = value;
  editor.requestDraw();
});

function updateEditorSequenceAndBpm() {
  if (!editor) return;
  editor.activeSequence = activeSequence.value;
  editor.bpm = bpm.value;
  editor.requestDraw();
}

const bpm = computed(() => getBpm());

// The active sequence and the bpm change rarely, so they follow the editor in
// a separate watch: the per-frame videoTime watch stays free of these writes.
watch([activeSequence, bpm] as const, updateEditorSequenceAndBpm);

const visibleSequences = computed(() => sequences.value.filter((sequence) => store.isVisible(sequence)));

onMounted(() => {
  updateViewportSizes();
  window.addEventListener("resize", updateViewportSizes);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewportSizes);
});

let sharedLoadToken = 0;

// A payload can arrive at mount or later, when a link is pasted into an open
// tab: that changes only the hash, so the view is reused and onMounted does
// not run again.
watch(
  () => `${route?.query.d ?? ""}|${route?.query.p ?? ""}`,
  () => void loadSharedDiagram(),
  { immediate: true },
);

async function loadSharedDiagram() {
  // The wiring tests mount the view without a router, so both stay undefined there.
  if (!route || !router) return;
  const shared = typeof route.query.d === "string" ? route.query.d : "";
  const sharedPath = typeof route.query.p === "string" ? route.query.p : "";
  if (shared === "" && sharedPath === "") return;
  // Last one wins: a slow load must not overwrite the diagram of a newer one.
  const token = ++sharedLoadToken;
  sharedLinkError.value = false;
  try {
    let json: unknown;
    let path: string | null = null;
    if (shared !== "") {
      json = await decodeShareParam(shared);
    } else {
      path = decodeSharePath(sharedPath);
      if (!path) throw new Error("not a diagram path payload");
      json = await fetchBundledDiagram(path);
    }
    // A p= payload reuses the d= JSON shape: a DiagramJSON with a sequences
    // array. A bare SequenceJSON file is not shareable by path yet.
    if (!Array.isArray((json as DiagramJSON).sequences)) throw new Error("not a DiagramJSON payload");
    if (token !== sharedLoadToken) return;
    store.loadFromJSON(json as DiagramJSON);
    if (path !== null) {
      store.setBundledPath(path);
      store.setSaveFilename(path.split("/").pop() ?? "");
    }
  } catch (error) {
    if (token !== sharedLoadToken) return;
    sharedLinkError.value = true;
    console.error("Could not load the shared diagram:", error);
  }
  if (token !== sharedLoadToken) return;
  // The payload has served its purpose, so the long URL leaves the address bar
  // and history, whether the load worked or not.
  await router.replace({ query: {} });
}

onBeforeUnmount(() => {
  editor?.destroy();
  editor = null;
});
</script>

<template>
  <div class="home-view">
    <DiagramSidebar
      v-model:open="drawerOpen"
      v-model:scale-elements="appearance.scaleElements"
      v-model:show-labels="appearance.showLabels"
      v-model:show-legend="appearance.showLegend"
      v-model:dark-mode="appearance.darkMode"
      mode="home"
      :mobile="isMobile"
      :help-items="helpItems"
      :video-error="videoStatus === 'invalid'"
      @load-start="resetPlaybackSpeed"
    />

    <div class="home-view__main">
      <small v-if="sharedLinkError" class="home-view__shared-link-error">{{ $t("files.sharedLinkError") }}</small>
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
              <div v-if="sequences.length === 0" class="home-view__empty-hint">
                <Button :label="$t('files.load')" icon="pi pi-folder-open" severity="primary" @click="openLibrary" />
                <Button
                  :label="$t('files.openInEditor')"
                  icon="pi pi-pencil"
                  severity="primary"
                  @click="router.push('/editor')"
                />
              </div>
              <div class="home-view__elements">
                <TimeSyncPane
                  ref="elementsPane"
                  :sequences="visibleSequences"
                  :time-seconds="videoTime"
                  :bpm="bpm"
                  :loop-window="loopDrawWindow"
                  @seek="setTimestamp"
                  @scrub-start="onPaneScrubStart"
                  @scrub-end="onPaneScrubEnd"
                />
                <DiagramLegend
                  v-if="appearance.showLegend"
                  :sequences="visibleSequences"
                  :time-seconds="videoTime"
                  :bpm="bpm"
                />
              </div>
            </div>
          </SplitterPanel>
        </Splitter>
      </div>
      <div class="home-view__player">
        <Button
          v-if="isMobile"
          icon="pi pi-bars"
          :aria-label="$t('player.openSettings')"
          severity="secondary"
          text
          rounded
          @click="drawerOpen = true"
        />
        <div class="home-view__player-controls">
          <Button
            icon="pi pi-stopwatch"
            :aria-pressed="shortDrawRange"
            :aria-label="$t('player.shortRange')"
            severity="secondary"
            :text="!shortDrawRange"
            rounded
            size="small"
            @click="shortDrawRange = !shortDrawRange"
          />
          <Button
            icon="pi pi-step-backward"
            :aria-label="$t('player.jumpToStart')"
            severity="secondary"
            rounded
            size="small"
            @click="jumpToStart"
          />
          <Button
            :icon="playing ? 'pi pi-pause' : 'pi pi-play'"
            :aria-label="playing ? $t('player.pause') : $t('player.play')"
            rounded
            @click="togglePlayback"
          />
          <Button
            icon="pi pi-replay"
            :aria-label="loopAriaLabel"
            :severity="loopStage === 'idle' ? 'secondary' : 'primary'"
            rounded
            :class="{ 'home-view__loop-armed': loopStage === 'armed' }"
            @click="toggleLoop"
          />
          <Select
            v-model="playbackSpeed"
            :options="playbackSpeedOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            size="small"
            :aria-label="$t('player.speed')"
            class="home-view__speed"
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

.home-view__shared-link-error {
  margin-block-end: 0.25rem;
  color: var(--p-form-field-invalid-hover-border-color);
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

/* A loop point waits for its partner: the armed button pulses until the loop closes. */
.home-view__loop-armed {
  animation: home-view-loop-pulse 1.1s ease-in-out infinite;
}

@keyframes home-view-loop-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-view__loop-armed {
    animation: none;
  }
}

/* The speed select reads as a fixed-width chip: no arrow, centered label. */
.home-view__speed {
  width: 3.25rem;
  height: 2rem;
  align-items: center;
  border-radius: 9999px;

  :deep(.p-select-label) {
    padding: 0 0.25rem;
    text-align: center;
  }

  :deep(.p-select-dropdown) {
    display: none;
  }
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
  background: var(--p-content-background);
}

.home-view__canvas-area {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

/* The elements pane wrapper floats above the canvas, so its rows can change
   without resizing the canvas or the playback bar below. */
.home-view__elements {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  width: auto;
  z-index: 5;
}

/* Same spot as the editor's empty-canvas button, but two stacked. */
.home-view__empty-hint {
  position: absolute;
  bottom: 0.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
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
