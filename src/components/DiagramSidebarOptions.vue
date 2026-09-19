<script setup lang="ts">
import Checkbox from "openvue/checkbox";

const showLabels = defineModel<boolean>("showLabels", { required: true });
const scaleElements = defineModel<boolean>("scaleElements", { required: true });
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
</style>
