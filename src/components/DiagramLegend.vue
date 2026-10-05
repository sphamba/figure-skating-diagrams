<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Time } from "@/engine/coordinates";
import {
  defaultTraceColorL,
  defaultTraceColorR,
  sequenceHasCursor,
  traceOpacityForward,
  type FootKey,
  type Sequence,
} from "@/engine/sequence";

const props = defineProps<{
  sequences: Sequence[];
  timeSeconds?: number | null;
  bpm: number;
}>();

const { t } = useI18n();

// The sample colors come from the first visible sequence, or from the defaults when the list is empty.
const colorSource = computed(() => props.sequences[0]);

type FootDirection = "forward" | "backward";

// The highlights follow the first visible sequence that owns a cursor at the current
// time. A sequence without time evolution or outside its own time range has none.
const cursorSource = computed(() => {
  const time = props.timeSeconds;
  if (time == null) return undefined;
  return props.sequences.find((sequence) => sequenceHasCursor(sequence, time, props.bpm));
});

function activeDirection(footKey: FootKey): FootDirection | null {
  const sequence = cursorSource.value;
  const time = props.timeSeconds;
  if (!sequence || time == null) return null;
  const u = sequence.getPathCoordinateFromTime(time as Time, props.bpm);
  if (sequence.getFootTraceContactPosition(footKey, u) === null) return null;
  const tangent = sequence.path.getDerivative(u).normalized();
  const foot = sequence.getWorldForwardDirection(footKey, u);
  return tangent.x * foot.x + tangent.y * foot.y < 0 ? "backward" : "forward";
}

const activeL = computed(() => activeDirection("footL"));
const activeR = computed(() => activeDirection("footR"));

type LegendRow = {
  key: string;
  label: string;
  color: string;
  dashed: boolean;
  active: boolean;
};

const rows = computed<LegendRow[]>(() => {
  const sequence = colorSource.value;
  const colorL = sequence?.traceColorL ?? defaultTraceColorL;
  const colorR = sequence?.traceColorR ?? defaultTraceColorR;
  return [
    {
      key: "leftForward",
      label: t("legend.leftForward"),
      color: colorL,
      dashed: false,
      active: activeL.value === "forward",
    },
    {
      key: "leftBackward",
      label: t("legend.leftBackward"),
      color: colorL,
      dashed: true,
      active: activeL.value === "backward",
    },
    {
      key: "rightForward",
      label: t("legend.rightForward"),
      color: colorR,
      dashed: false,
      active: activeR.value === "forward",
    },
    {
      key: "rightBackward",
      label: t("legend.rightBackward"),
      color: colorR,
      dashed: true,
      active: activeR.value === "backward",
    },
  ];
});
</script>

<template>
  <div class="diagram-legend">
    <div
      v-for="row in rows"
      :key="row.key"
      class="diagram-legend__row"
      :class="{ 'diagram-legend__row--active': row.active }"
    >
      <span
        class="diagram-legend__line"
        :class="{ 'diagram-legend__line--dashed': row.dashed }"
        :style="{ color: row.color, opacity: row.dashed ? 1 : traceOpacityForward }"
      ></span>
      <span class="diagram-legend__label">{{ row.label }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* top 100% hangs the legend below its wrapper, which wraps the element pane. */
.diagram-legend {
  position: absolute;
  top: 100%;
  right: 1rem;
  margin-top: 0.5rem;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.375rem;
  background: var(--p-content-background, #ffffff);
  box-shadow: 0 2px 6px rgb(0 0 0 / 15%);
  font-size: 0.875rem;
  color: var(--p-text-color);
  /* The legend is only a key: pointer input must reach the canvas below it. */
  pointer-events: none;
}

.diagram-legend__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  /* The padding stays on every row, so a changing highlight cannot shift the text. */
  padding: 0 0.375rem;
  border-radius: 0.25rem;
}

.diagram-legend__row--active {
  background: var(--p-highlight-background);
}

.diagram-legend__line {
  width: 1.5rem;
  height: 2px;
  background-color: currentColor;
}

.diagram-legend__line--dashed {
  background: repeating-linear-gradient(to right, currentColor 0 4px, transparent 4px 8px);
}

/* Mobile keeps the legend, with text at about 85% of the desktop size and a tighter
   box (right 16px -> 4px, padding 6px 8px -> 2.4px). */
@media (max-width: 767.98px) {
  .diagram-legend {
    right: 0.25rem;
    padding: 0.15rem;
    font-size: 0.75rem;
  }
}
</style>
