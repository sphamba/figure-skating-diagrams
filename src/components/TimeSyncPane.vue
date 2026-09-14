<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Accordion from "openvue/accordion";
import AccordionContent from "openvue/accordioncontent";
import AccordionHeader from "openvue/accordionheader";
import AccordionPanel from "openvue/accordionpanel";
import Button from "openvue/button";
import Drawer from "openvue/drawer";
import { sequenceTimeRange, type Sequence } from "@/engine/sequence";
import type { Element as DiagramElement } from "@/engine/element/element";
import type { Annotation } from "@/engine/annotation";
import type { Time, PathCoordinate } from "@/engine/coordinates";
import { elementFullName } from "@/engine/element/fullName";
import { textColorFor } from "@/utils/contrast";

const props = defineProps<{
  sequences: Sequence[];
  timeSeconds: number | null;
  bpm: number;
}>();

type AnnotationRow = {
  kind: "annotation";
  annotation: Annotation;
  sequence: Sequence;
  color: string;
  title: string;
  description: string;
};

type ElementRow = {
  kind: "element";
  element: DiagramElement;
  sequence: Sequence;
  label: string;
  fullName: string;
};

type Row = AnnotationRow | ElementRow;

const annotationRows = computed<AnnotationRow[]>(() => {
  const time = props.timeSeconds;
  if (time === null) return [];
  const rows: AnnotationRow[] = [];
  for (const sequence of props.sequences) {
    if (!cursorInSequence(sequence)) continue;
    const u = sequence.getPathCoordinateFromTime(time as Time, props.bpm);
    for (const annotation of [...sequence.annotations].sort((a, b) => (a.start as number) - (b.start as number))) {
      const lo = Math.min(annotation.start as number, annotation.end as number);
      const hi = Math.max(annotation.start as number, annotation.end as number);
      if (lo <= u && u <= hi) {
        rows.push({
          kind: "annotation",
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

const elementRows = computed<ElementRow[]>(() => {
  const time = props.timeSeconds;
  if (time === null) return [];
  const rows: ElementRow[] = [];
  for (const sequence of props.sequences) {
    if (!cursorInSequence(sequence)) continue;
    const u = sequence.getPathCoordinateFromTime(time as Time, props.bpm);
    const sorted = [...sequence.elements].sort((a, b) => (a.start as number) - (b.start as number));
    const currentIndex = sorted.findIndex(
      (element) =>
        Math.min(element.start as number, element.end as number) <= u &&
        u <= Math.max(element.start as number, element.end as number),
    );
    let entry = currentIndex === -1 ? undefined : sorted[currentIndex];
    if (entry && entry.shortName === "") entry = undefined;
    if (!entry) {
      let best: DiagramElement | undefined;
      let bestDistance = Infinity;
      for (const element of sorted) {
        if (element.shortName === "") continue;
        const end = Number(sequence.getTimeFromPathCoordinate(element.end as PathCoordinate, props.bpm));
        const distance = Math.abs(end - time);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = element;
        }
      }
      entry = best;
    }
    if (entry) {
      rows.push({
        kind: "element",
        element: entry,
        sequence,
        label: entry.shortName,
        fullName: elementFullName(entry),
      });
    }
  }
  return rows;
});

const rows = computed<Row[]>(() => [...annotationRows.value, ...elementRows.value]);

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

const open = ref(true);

// Same curve as the drawer's open transition, so rows unfold in sync.
const ROW_TRANSITION = "0.5s cubic-bezier(0.32, 0.72, 0, 1)";
const rowTimers = new Map<Element, ReturnType<typeof setTimeout>>();

function clearRowAfterTransition(el: HTMLElement, done?: () => void) {
  el.style.transition = "";
  el.style.height = "";
  el.style.overflow = "";
  done?.();
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
  rowTimers.set(
    el,
    setTimeout(() => clearRowAfterTransition(element, done), 520),
  );
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
  rowTimers.set(
    el,
    setTimeout(() => clearRowAfterTransition(element, done), 520),
  );
}

onBeforeUnmount(() => {
  for (const timer of rowTimers.values()) clearTimeout(timer);
  rowTimers.clear();
});

const handleRef = ref<{ $el?: HTMLElement | null } | null>(null);
const drawerRect = ref({ left: 0, width: 0, bottom: 0 });
const HANDLE_GAP = 6;
const drawerHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;
let drawerObserver: ResizeObserver | null = null;

function updateDrawerRect() {
  const element = handleRef.value?.$el;
  const host = element?.parentElement;
  if (!host) return;
  const rect = host.getBoundingClientRect();
  drawerRect.value = { left: rect.left, width: rect.width, bottom: rect.bottom };
}

function measureDrawerHeight() {
  const drawer = document.querySelector<HTMLElement>(".p-drawer-mask .p-drawer");
  drawerHeight.value = drawer?.offsetHeight ?? 0;
  if (drawer && !drawerObserver && typeof ResizeObserver !== "undefined") {
    drawerObserver = new ResizeObserver(measureDrawerHeight);
    drawerObserver.observe(drawer);
  }
}

// The mask centers the drawer, so a margin-left of twice the canvas offset minus the
// viewport plus the canvas width aligns the drawer exactly under the canvas.
const drawerRootStyle = computed(() => {
  const { left, width } = drawerRect.value;
  const margin = 2 * left - document.documentElement.clientWidth + width;
  return {
    width: `${width}px`,
    marginLeft: `${margin}px`,
    height: "auto",
    maxHeight: "60%",
    borderWidth: 0,
    pointerEvents: "auto",
  };
});

watch(
  open,
  (value) => {
    if (value) {
      updateDrawerRect();
      nextTick(() => {
        requestAnimationFrame(measureDrawerHeight);
      });
      return;
    }
    drawerHeight.value = 0;
    drawerObserver?.disconnect();
    drawerObserver = null;
  },
  { immediate: true },
);

onMounted(() => {
  updateDrawerRect();
  const host = handleRef.value?.$el?.parentElement;
  if (host && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(updateDrawerRect);
    resizeObserver.observe(host);
  }
});

onBeforeUnmount(() => {
  for (const timer of rowTimers.values()) clearTimeout(timer);
  rowTimers.clear();
  resizeObserver?.disconnect();
  resizeObserver = null;
  drawerObserver?.disconnect();
  drawerObserver = null;
});

const handleStyle = computed(() => {
  if (!open.value || drawerHeight.value <= 0) return { bottom: "1rem", right: "1rem" };
  // Place the handle above the drawer's top edge.
  const drawerTop = window.innerHeight - drawerHeight.value;
  const bottom = drawerRect.value.bottom - (drawerTop - HANDLE_GAP);
  return { bottom: `${bottom}px`, right: "1rem" };
});
</script>

<template>
  <Button
    ref="handleRef"
    class="time-sync-pane__handle"
    :style="handleStyle"
    :label="open ? 'Hide elements' : 'Show elements'"
    :icon="open ? 'pi pi-chevron-down' : 'pi pi-chevron-up'"
    :aria-label="open ? 'Fold the drawer down' : 'Unfold the drawer'"
    :aria-expanded="open"
    severity="secondary"
    rounded
    size="small"
    @click="open = !open"
  />
  <Drawer
    v-model:visible="open"
    position="bottom"
    :modal="false"
    :dismissable="false"
    :block-scroll="false"
    :show-close-icon="false"
    :pt="{
      root: { style: drawerRootStyle },
      header: { style: { display: 'none' } },
      content: {
        style: { paddingTop: '0.25rem', paddingBottom: '0.25rem', paddingLeft: '0.25rem', paddingRight: '0.25rem' },
      },
    }"
  >
    <div class="time-sync-pane">
      <Accordion :multiple="true">
        <TransitionGroup
          tag="div"
          :css="false"
          @before-enter="rowBeforeEnter"
          @enter="rowEnter"
          @before-leave="rowBeforeLeave"
          @leave="rowLeave"
        >
          <AccordionPanel v-for="(row, index) in annotationRows" :key="index" :value="index">
            <AccordionHeader>
              <span
                class="time-sync-pane__chip time-sync-pane__chip--annotation"
                :style="{ background: row.color, color: textColorFor(row.color) }"
                >{{ row.title }}</span
              >
              <span class="time-sync-pane__sequence">{{ row.sequence.name }}</span>
            </AccordionHeader>
            <AccordionContent>
              <p class="time-sync-pane__detail">{{ row.description || "No description" }}</p>
            </AccordionContent>
          </AccordionPanel>
        </TransitionGroup>
      </Accordion>

      <Accordion :multiple="true">
        <TransitionGroup
          tag="div"
          :css="false"
          @before-enter="rowBeforeEnter"
          @enter="rowEnter"
          @before-leave="rowBeforeLeave"
          @leave="rowLeave"
        >
          <AccordionPanel v-for="(row, index) in elementRows" :key="index" :value="index">
            <AccordionHeader>
              <span class="time-sync-pane__chip">{{ row.label }}</span>
              <span class="time-sync-pane__sequence">{{ row.sequence.name }}</span>
            </AccordionHeader>
            <AccordionContent>
              <p class="time-sync-pane__detail">{{ row.fullName }}</p>
            </AccordionContent>
          </AccordionPanel>
        </TransitionGroup>
      </Accordion>

      <span v-if="rows.length === 0" class="time-sync-pane__empty">No element yet</span>
    </div>
  </Drawer>
</template>

<style scoped lang="scss">
.time-sync-pane :deep(.p-accordioncontent-content) {
  padding: 0 0.5rem 0.25rem;
}

.time-sync-pane__handle {
  position: absolute;
  transition: bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1);
  z-index: 1200;
}

.time-sync-pane {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
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
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.75rem;
  border-radius: 1rem;
  background-color: var(--p-surface-200, #e8e8e8);
  color: black;
  font-weight: 600;
}

.time-sync-pane__sequence {
  margin-left: 0;
  color: var(--p-text-muted-color);
  font-weight: 400;
}

.time-sync-pane__detail {
  margin: 0 0.25rem 0;
  color: var(--p-text-muted-color);
}

.time-sync-pane__empty {
  color: var(--p-text-muted-color);
  font-style: italic;
}
</style>
