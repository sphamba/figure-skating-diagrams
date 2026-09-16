<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Accordion from "openvue/accordion";
import AccordionContent from "openvue/accordioncontent";
import AccordionHeader from "openvue/accordionheader";
import AccordionPanel from "openvue/accordionpanel";
import { sequenceTimeRange, type Sequence } from "@/engine/sequence";
import { WHEEL_SENSITIVITY } from "@/engine/constants";
import type { Annotation } from "@/engine/annotation";
import type { Time, PathCoordinate } from "@/engine/coordinates";
import { elementFullName } from "@/engine/element/fullName";
import { textColorFor } from "@/utils/contrast";

const props = defineProps<{
  sequences: Sequence[];
  timeSeconds: number | null;
  bpm: number;
}>();

const emit = defineEmits<{ seek: [seconds: number]; scrubStart: []; scrubEnd: [] }>();

type AnnotationRow = {
  kind: "annotation";
  key: string;
  annotation: Annotation;
  sequence: Sequence;
  color: string;
  title: string;
  description: string;
};

type ElementItem = {
  key: string;
  label: string;
  fullName: string;
  startTime: number;
};

type ElementStrip = {
  key: string;
  sequence: Sequence;
  items: ElementItem[];
  current: number;
};

const annotationRows = computed<AnnotationRow[]>(() => {
  const time = props.timeSeconds;
  if (time === null) return [];
  const rows: AnnotationRow[] = [];
  let sequenceIndex = -1;
  for (const sequence of props.sequences) {
    sequenceIndex++;
    if (!cursorInSequence(sequence)) continue;
    const u = sequence.getPathCoordinateFromTime(time as Time, props.bpm);
    for (const annotation of [...sequence.annotations].sort((a, b) => (a.start as number) - (b.start as number))) {
      const lo = Math.min(annotation.start as number, annotation.end as number);
      const hi = Math.max(annotation.start as number, annotation.end as number);
      if (lo <= u && u <= hi) {
        rows.push({
          kind: "annotation",
          key: `${sequenceIndex}-${annotation.start}-${annotation.end}-${annotation.title}`,
          annotation,
          sequence,
          color: annotation.color,
          title: annotation.title,
          description: annotation.description,
        });
      }
    }
  }
  return rows;
});

// One horizontal strip per sequence: the named elements in a line. The strip
// offset centers the current element.
// Elements without a short name are not shown.
const CURRENT_TOLERANCE = 0.000001; // path coordinate, meters
const elementStrips = computed<ElementStrip[]>(() => {
  const time = props.timeSeconds;
  if (time === null) return [];
  const strips: ElementStrip[] = [];
  let sequenceIndex = -1;
  for (const sequence of props.sequences) {
    sequenceIndex++;
    if (!cursorInSequence(sequence)) continue;
    const shown = [...sequence.elements]
      .sort((a, b) => (a.start as number) - (b.start as number))
      .filter((element) => element.shortName !== "");
    if (shown.length === 0) continue;
    const u = sequence.getPathCoordinateFromTime(time as Time, props.bpm);
    // The last element whose start the cursor has reached. At a shared boundary
    // the cursor belongs to the element that starts there, so the previous one
    // does not stay selected. The tolerance keeps the rounding of the seek time
    // from putting the cursor just below a start.
    let current = -1;
    for (let index = 0; index < shown.length; index++) {
      const element = shown[index]!;
      if (Math.min(element.start as number, element.end as number) - CURRENT_TOLERANCE <= u) current = index;
    }
    if (current === -1) {
      let bestDistance = Infinity;
      for (let index = 0; index < shown.length; index++) {
        const element = shown[index]!;
        const end = Number(sequence.getTimeFromPathCoordinate(element.end as PathCoordinate, props.bpm));
        const distance = Math.abs(end - time);
        if (distance < bestDistance) {
          bestDistance = distance;
          current = index;
        }
      }
    }
    if (current === -1) continue;
    strips.push({
      key: `${sequenceIndex}-${sequence.name}`,
      sequence,
      current,
      items: shown.map((element, index) => ({
        key: `${index}-${element.start}-${element.end}`,
        label: element.shortName,
        fullName: elementFullName(element),
        startTime: Number(sequence.getTimeFromPathCoordinate(element.start as PathCoordinate, props.bpm)),
      })),
    });
  }
  return strips;
});

const hasRows = computed(() => annotationRows.value.length > 0 || elementStrips.value.length > 0);

// Element panels currently unfolded; the current element's full name shows
// below, because the content only mounts when the panel lazily opens.
const openStripKeys = ref<string[]>([]);

function isStripOpen(key: string): boolean {
  return openStripKeys.value.includes(key);
}

function toggleStripOpen(key: string) {
  openStripKeys.value = isStripOpen(key)
    ? openStripKeys.value.filter((item) => item !== key)
    : [...openStripKeys.value, key];
}

// Accordion emits panel values as strings in multiple mode, so normalize them.
function toOpenStripKeys(value: string | string[] | null | undefined): string[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

// Annotation rows with unfolded panels; the inline description hides there,
// because the full text shows in the unfolded content below.
const openAnnotationRows = ref<number[]>([]);

// Accordion emits panel values as strings in multiple mode, so normalize them to numbers.
function toOpenRows(value: string | string[] | null | undefined): number[] {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  const rows: number[] = [];
  for (const item of list) {
    const index = Number(item);
    if (!Number.isNaN(index)) rows.push(index);
  }
  return rows;
}

function toggleAnnotationOpen(index: number) {
  openAnnotationRows.value = openAnnotationRows.value.includes(index)
    ? openAnnotationRows.value.filter((item) => item !== index)
    : [...openAnnotationRows.value, index];
}

// A cursor beyond a sequence's time range would clamp to its boundary coordinate,
// so sequences the cursor is not within are skipped entirely.
function cursorInSequence(sequence: Sequence): boolean {
  if (sequence.path.curves.length === 0) return false;
  if (sequence.keyframes.time.length <= 1) return false;
  const time = props.timeSeconds;
  if (time === null) return false;
  const range = sequenceTimeRange(sequence, props.bpm);
  return range !== null && time >= range[0] && time <= range[1];
}

function seekTo(strip: ElementStrip, item: ElementItem) {
  emit("seek", item.startTime);
}

// ---- Element strip scrolling ----

// The strip containers, ordered like elementStrips.
const stripContainers = ref<(HTMLElement | null)[]>([]);

function setStripRef(index: number, element: unknown) {
  const container = element as HTMLElement | null;
  stripContainers.value[index] = container;
  if (container && !observedContainers.has(container)) {
    observedContainers.add(container);
    resizeObserver?.observe(container);
  }
}

const observedContainers = new WeakSet<HTMLElement>();
let resizeObserver: ResizeObserver | null = null;

const lastCurrent = new Map<number, number>();

// Room equal to half the container width, so the first and last elements
// can reach the horizontal center.
function setStripTrackPadding(container: HTMLElement) {
  const track = container.firstElementChild as HTMLElement | null;
  if (!track) return;
  const pad = Math.max(0, container.clientWidth / 2);
  track.style.paddingLeft = `${pad}px`;
  track.style.paddingRight = `${pad}px`;
}

function centerStripItem(container: HTMLElement, index: number, behavior: ScrollBehavior) {
  const track = container.firstElementChild as HTMLElement | null;
  const item = track?.children[index] as HTMLElement | undefined;
  if (!item || track?.children.length === 0) return;
  const left = item.offsetLeft + item.offsetWidth / 2 - container.clientWidth / 2;
  if (Math.abs(container.scrollLeft - left) < 1) return;
  // A pending snap from an earlier user scroll is stale once content moves under it.
  clearSnapTimer(container);
  markProgrammaticScroll(container);
  container.scrollTo({ left: Math.max(0, left), behavior });
}

function recenterStrips() {
  elementStrips.value.forEach((strip, index) => {
    const container = stripContainers.value[index];
    if (!container) return;
    setStripTrackPadding(container);
    if (lastCurrent.get(index) === strip.current) return;
    // While the user scrolls, the selection follows the scroll, so no
    // programmatic recenter that would fight the scrolling.
    if (isUserScrolling(container)) return;
    lastCurrent.set(index, strip.current);
    centerStripItem(container, strip.current, "smooth");
  });
}

function resendCurrentOnResize() {
  elementStrips.value.forEach((strip, index) => {
    const container = stripContainers.value[index];
    if (!container) return;
    setStripTrackPadding(container);
    // Like recenterStrips: an active user scroll is neither masked nor fought.
    if (isUserScrolling(container)) return;
    if (lastCurrent.get(index) === undefined) return;
    centerStripItem(container, strip.current, "smooth");
  });
}

// Gentle snap: after a scroll settles, ease the closest element to the center.
const snapTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

function stripCenterIndex(container: HTMLElement): number {
  const track = container.firstElementChild as HTMLElement | null;
  if (!track || track.children.length === 0) return -1;
  const target = container.scrollLeft + container.clientWidth / 2;
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < track.children.length; index++) {
    const item = track.children[index] as HTMLElement;
    const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function snapStrip(container: HTMLElement, behavior: ScrollBehavior = "smooth", allowEmit = false) {
  const bestIndex = stripCenterIndex(container);
  if (bestIndex === -1) return;
  centerStripItem(container, bestIndex, behavior);
  // Only a snap scheduled by a user gesture may select; programmatic
  // snaps only correct the visual position.
  if (allowEmit) selectStripIndex(container, bestIndex);
}

function scheduleSnap(container: HTMLElement, delay = 150) {
  const previous = snapTimers.get(container);
  if (previous !== undefined) clearTimeout(previous);
  snapTimers.set(
    container,
    setTimeout(() => {
      snapTimers.delete(container);
      snapStrip(container, "smooth", true);
      endUserScroll(container);
      const stripIndex = stripContainers.value.indexOf(container);
      if (stripIndex !== -1) clearStripPreview(stripIndex);
    }, delay),
  );
}

function clearSnapTimer(container: HTMLElement) {
  const pending = snapTimers.get(container);
  if (pending !== undefined) {
    clearTimeout(pending);
    snapTimers.delete(container);
  }
}

// Scroll events that programmatic scrolls fire are ignored in this window.
const PROGRAMMATIC_GRACE = 600; // ms

const programmaticUntil = new WeakMap<HTMLElement, number>();
const lastUserScroll = new WeakMap<HTMLElement, number>();

function markProgrammaticScroll(container: HTMLElement) {
  // A programmatic scroll is never the continuation of a user gesture. Without
  // this, a recent click on an element still marks user input, so the automatic
  // recenter after the seek reads as a scroll gesture and pauses the playback
  // until the snap settles. A live press is kept: the drag that follows it is
  // still a user gesture, even without a scroll event yet.
  if (!pressedPointers.has(container)) userInputUntil.delete(container);
  programmaticUntil.set(container, Date.now() + PROGRAMMATIC_GRACE);
}

function isProgrammaticScroll(container: HTMLElement): boolean {
  return Date.now() < (programmaticUntil.get(container) ?? 0);
}

// A scroll event is a user gesture only soon after real input, so a delayed
// programmatic scroll event cannot start a user gesture and select an element.
const USER_INPUT_TTL = 1000; // ms

const userInputUntil = new WeakMap<HTMLElement, number>();

function markUserInput(container: HTMLElement) {
  userInputUntil.set(container, Date.now() + USER_INPUT_TTL);
}

function hasRecentUserInput(container: HTMLElement): boolean {
  return Date.now() < (userInputUntil.get(container) ?? 0);
}

const USER_SCROLL_GRACE = 250; // ms

function isUserScrolling(container: HTMLElement): boolean {
  return Date.now() - (lastUserScroll.get(container) ?? 0) < USER_SCROLL_GRACE;
}

const lastSeeked = new Map<Sequence, number>();

// Strips with a pointer pressed down, so a programmatic scroll can tell a live
// press from a finished click.
const pressedPointers = new WeakSet<HTMLElement>();

// ---- User scroll gestures ----

// A user scroll/drag gesture is active per strip. Its start and end are reported
// like a canvas time cursor scrub, so the playback can pause and resume. The
// time cursor and other timelines update only when the gesture has settled.
const activeGestures = new Set<HTMLElement>();

function beginUserScroll(container: HTMLElement) {
  if (activeGestures.has(container)) return;
  activeGestures.add(container);
  emit("scrubStart");
}

function endUserScroll(container: HTMLElement) {
  if (!activeGestures.delete(container)) return;
  emit("scrubEnd");
}

// Visual selection preview: while the user scrolls, the element at the center
// shows as selected, but the time cursor updates only on settle.
const previewCurrent = ref<number[]>([]);

function setStripPreview(container: HTMLElement) {
  const stripIndex = stripContainers.value.indexOf(container);
  if (stripIndex === -1) return;
  const index = stripCenterIndex(container);
  if (previewCurrent.value[stripIndex] === index) return;
  const next = [...previewCurrent.value];
  next[stripIndex] = index;
  previewCurrent.value = next;
}

function clearStripPreview(stripIndex: number) {
  if (previewCurrent.value[stripIndex] === undefined) return;
  const next = [...previewCurrent.value];
  delete next[stripIndex];
  previewCurrent.value = next;
}

function selectStripIndex(container: HTMLElement, itemIndex: number) {
  const stripIndex = stripContainers.value.indexOf(container);
  if (stripIndex === -1) return;
  const strip = elementStrips.value[stripIndex];
  if (!strip) return;
  const item = strip.items[itemIndex];
  if (!item) return;
  if (lastSeeked.get(strip.sequence) === item.startTime) return;
  lastSeeked.set(strip.sequence, item.startTime);
  emit("seek", item.startTime);
}

// On desktop the wheel scrolls the strip horizontally.
function onStripWheel(event: WheelEvent) {
  const container = event.currentTarget as HTMLElement;
  event.preventDefault();
  const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (delta !== 0) {
    markUserInput(container);
    beginUserScroll(container);
    container.scrollLeft += delta * WHEEL_SENSITIVITY;
    scheduleSnap(container);
  }
}

function onStripPointerDown(event: PointerEvent) {
  const container = event.currentTarget as HTMLElement;
  pressedPointers.add(container);
  markUserInput(container);
}

// A drag right after a pointer release is a new gesture, so a press that
// outlives its scroll events cannot keep the gesture classification alive.
function onStripPointerUp(event: PointerEvent) {
  pressedPointers.delete(event.currentTarget as HTMLElement);
}

function onStripScroll(event: Event) {
  const container = event.currentTarget as HTMLElement;
  const freshInput = hasRecentUserInput(container);
  if (isProgrammaticScroll(container) && !freshInput) {
    // Refresh the window while programmatic scroll events keep arriving, so
    // the filter tracks the whole smooth scroll, not a fixed delay.
    markProgrammaticScroll(container);
    return;
  }
  // A scroll event without real input is programmatic, e.g. a recenter whose
  // events lag behind the smooth scroll under load.
  if (!freshInput) return;
  beginUserScroll(container);
  lastUserScroll.set(container, Date.now());
  // Visually select the center element, but wait for the settle before the seek.
  setStripPreview(container);
  scheduleSnap(container);
}

// A smooth programmatic scroll also fires scrollend in modern browsers, so clear
// the suppression then instead of waiting out the grace alone.
function onStripScrollEnd(event: Event) {
  programmaticUntil.delete(event.currentTarget as HTMLElement);
}

watch(
  elementStrips,
  () => {
    stripContainers.value.length = elementStrips.value.length;
    previewCurrent.value.length = elementStrips.value.length;
    clearObsoleteSeeked();
    nextTick(recenterStrips);
  },
  { immediate: true },
);

// Drop dedupe entries of sequences that left, so index shifts cannot
// suppress a valid selection of the next strip in the set.
function clearObsoleteSeeked() {
  const activeSequences = new Set(elementStrips.value.map((strip) => strip.sequence));
  for (const sequence of lastSeeked.keys()) {
    if (!activeSequences.has(sequence)) lastSeeked.delete(sequence);
  }
}

// ---- Row unfold transition ----

const ROW_TRANSITION = "0.5s cubic-bezier(0.32, 0.72, 0, 1)";
const rowTimers = new Map<Element, ReturnType<typeof setTimeout>>();

function clearRowAfterTransition(el: HTMLElement, done?: () => void) {
  rowTimers.delete(el);
  el.style.transition = "";
  el.style.height = "";
  el.style.overflow = "";
  done?.();
}

// A previous timer is cleared before a new transition, so a stale timer cannot
// reset the styles mid-animation or complete the wrong transition, which replays
// the appear/disappear hooks a second time.
function setRowTimer(el: Element, callback: () => void) {
  const previous = rowTimers.get(el);
  if (previous !== undefined) clearTimeout(previous);
  rowTimers.set(el, setTimeout(callback, 520));
}

function rowBeforeEnter(el: Element) {
  const element = el as HTMLElement;
  element.style.overflow = "hidden";
  element.style.height = "0px";
}

function rowEnter(el: Element, done: () => void) {
  const element = el as HTMLElement;
  const target = element.scrollHeight;
  element.style.transition = `height ${ROW_TRANSITION}`;
  requestAnimationFrame(() => {
    element.style.height = `${target}px`;
  });
  setRowTimer(el, () => clearRowAfterTransition(element, done));
}

function rowBeforeLeave(el: Element) {
  const element = el as HTMLElement;
  element.style.overflow = "hidden";
  element.style.height = `${element.offsetHeight}px`;
  element.style.transition = `height ${ROW_TRANSITION}`;
}

function rowLeave(el: Element, done: () => void) {
  const element = el as HTMLElement;
  requestAnimationFrame(() => {
    element.style.height = "0px";
  });
  setRowTimer(el, () => clearRowAfterTransition(element, done));
}

onBeforeUnmount(() => {
  for (const timer of rowTimers.values()) clearTimeout(timer);
  rowTimers.clear();
});

onMounted(() => {
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(resendCurrentOnResize);
  }
});

onBeforeUnmount(() => {
  for (const container of [...activeGestures]) endUserScroll(container);
  activeGestures.clear();
  for (const timer of rowTimers.values()) clearTimeout(timer);
  rowTimers.clear();
  for (const timer of snapTimers.values()) clearTimeout(timer);
  snapTimers.clear();
  lastSeeked.clear();
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <div class="time-sync-pane">
    <Accordion
      :multiple="true"
      :lazy="true"
      :value="openAnnotationRows"
      @update:value="(v) => (openAnnotationRows = toOpenRows(v))"
    >
      <TransitionGroup
        tag="div"
        :css="false"
        @before-enter="rowBeforeEnter"
        @enter="rowEnter"
        @before-leave="rowBeforeLeave"
        @leave="rowLeave"
      >
        <AccordionPanel v-for="(row, index) in annotationRows" :key="row.key" :value="index">
          <AccordionHeader asChild v-slot="{ active }">
            <div class="time-sync-pane__annotation-header">
              <span
                class="time-sync-pane__chip time-sync-pane__chip--annotation"
                :style="{ background: row.color, color: textColorFor(row.color) }"
                >{{ row.title }}</span
              >
              <button
                type="button"
                class="time-sync-pane__toggle"
                :aria-label="active ? 'Hide description' : 'Show description'"
                :aria-expanded="active"
                @click.stop="toggleAnnotationOpen(index)"
              >
                <span :class="active ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"></span>
              </button>
            </div>
          </AccordionHeader>
          <AccordionContent>
            <p class="time-sync-pane__detail">{{ row.description || "No description" }}</p>
          </AccordionContent>
        </AccordionPanel>
      </TransitionGroup>
    </Accordion>

    <Accordion
      :multiple="true"
      :lazy="true"
      :value="openStripKeys"
      @update:value="(v) => (openStripKeys = toOpenStripKeys(v))"
    >
      <TransitionGroup
        tag="div"
        :css="false"
        @before-enter="rowBeforeEnter"
        @enter="rowEnter"
        @before-leave="rowBeforeLeave"
        @leave="rowLeave"
      >
        <AccordionPanel v-for="(strip, stripIndex) in elementStrips" :key="strip.key" :value="strip.key">
          <AccordionHeader asChild v-slot="{ active }">
            <div class="time-sync-pane__strip-header">
              <div
                :ref="(element) => setStripRef(stripIndex, element)"
                class="time-sync-pane__strip"
                @pointerdown="onStripPointerDown"
                @pointerup="onStripPointerUp"
                @pointercancel="onStripPointerUp"
                @wheel="onStripWheel"
                @scroll="onStripScroll"
                @scrollend="onStripScrollEnd"
              >
                <div class="time-sync-pane__strip-track">
                  <button
                    v-for="(item, itemIndex) in strip.items"
                    :key="item.key"
                    type="button"
                    class="time-sync-pane__chip time-sync-pane__chip--element"
                    :class="{
                      'time-sync-pane__chip--dim':
                        itemIndex !== strip.current && itemIndex !== previewCurrent[stripIndex],
                    }"
                    :title="item.fullName"
                    @click="seekTo(strip, item)"
                  >
                    {{ item.label }}
                  </button>
                </div>
              </div>
              <button
                type="button"
                class="time-sync-pane__toggle"
                :aria-label="active ? 'Fold element names' : 'Unfold element names'"
                :aria-expanded="active"
                @click.stop="toggleStripOpen(strip.key)"
              >
                <span :class="active ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"></span>
              </button>
            </div>
          </AccordionHeader>
          <AccordionContent>
            <p class="time-sync-pane__strip-fullname">{{ strip.items[strip.current]?.fullName }}</p>
          </AccordionContent>
        </AccordionPanel>
      </TransitionGroup>
    </Accordion>

    <span v-if="!hasRows" class="time-sync-pane__empty">No element yet</span>
  </div>
</template>

<style scoped lang="scss">
.time-sync-pane :deep(.p-accordioncontent-content) {
  padding: 0 0.5rem 0.25rem;
}

.time-sync-pane {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 0.25rem;
  padding: 0.25rem;
  max-height: 40vh;
  overflow-y: auto;
  font-size: 0.875rem;
  /* The pane floats above the canvas: an opaque background keeps the text readable. */
  background: var(--p-content-background, #ffffff);
  border-top: 1px solid var(--p-content-border-color);
}

.time-sync-pane :deep(.p-accordionpanel) {
  border-width: 0;
}

.time-sync-pane :deep(.p-accordionheader) {
  justify-content: flex-start;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  color: var(--p-text-color);
}

.time-sync-pane__chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.75rem;
  border-radius: 1rem;
  background-color: var(--p-surface-200, #e8e8e8);
  color: black;
}

.time-sync-pane__chip--element {
  border: 0;
  font-family: inherit;
  font-size: inherit;
  font-weight: 400;
  cursor: pointer;
  transition: opacity 0.3s ease;
}

.time-sync-pane__chip--dim {
  opacity: 0.35;
}

.time-sync-pane__strip {
  position: relative;
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  margin-bottom: 0.25rem;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  // Chips end at the toggle button, so they do not show under it.
  clip-path: inset(0 1.5rem 0 0);
}

.time-sync-pane__strip::-webkit-scrollbar {
  display: none;
}

.time-sync-pane__strip-header {
  position: relative;
}

.time-sync-pane__annotation-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
}

.time-sync-pane__toggle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 1.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  color: var(--p-text-muted-color);
  z-index: 1;
}

.time-sync-pane__toggle .pi {
  font-size: 0.75rem;
}

.time-sync-pane__strip-fullname {
  margin: 0;
  font-weight: 400;
  color: var(--p-text-muted-color);
  text-align: center;
}

.time-sync-pane__strip-track {
  display: flex;
  gap: 0.5rem;
  width: max-content;
}

.time-sync-pane__detail {
  margin: 0;
  font-weight: 400;
  color: var(--p-text-muted-color);
  text-align: center;
}

.time-sync-pane__empty {
  color: var(--p-text-muted-color);
  font-style: italic;
}
</style>
