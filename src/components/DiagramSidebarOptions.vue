<script setup lang="ts">
import Checkbox from "openvue/checkbox";
import Slider from "openvue/slider";

const showLabels = defineModel<boolean>("showLabels", { required: true });
const scaleElements = defineModel<boolean>("scaleElements", { required: true });
const drawRange = defineModel<number>("drawRange", { required: true });
</script>

<template>
  <div class="diagram-sidebar__options">
    <div class="diagram-sidebar__scale-checkbox">
      <Checkbox v-model="showLabels" binary input-id="show-labels" />
      <label for="show-labels">Show labels</label>
    </div>
    <div class="diagram-sidebar__scale-checkbox">
      <Checkbox v-model="scaleElements" binary input-id="scale-elements-zoom" />
      <label for="scale-elements-zoom">Scale elements with zoom</label>
    </div>
    <label class="diagram-sidebar__mode-label">Draw range</label>
    <div class="diagram-sidebar__slider-param">
      <span class="diagram-sidebar__slider-label">short</span>
      <Slider
        v-model="drawRange"
        :min="0.001"
        :max="1"
        :step="0.001"
        aria-label="Draw range"
        class="diagram-sidebar__slider"
      />
      <span class="diagram-sidebar__slider-label">long</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.diagram-sidebar__options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.diagram-sidebar__scale-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.diagram-sidebar__slider-param {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.diagram-sidebar__slider-label {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  flex-shrink: 0;
}

.diagram-sidebar__slider {
  flex: 1;
}
</style>
