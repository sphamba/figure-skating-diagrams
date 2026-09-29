<script setup lang="ts">
import ToggleSwitch from "openvue/toggleswitch";

const showLabels = defineModel<boolean>("showLabels", { required: true });
const scaleElements = defineModel<boolean>("scaleElements", { required: true });
const darkMode = defineModel<boolean>("darkMode", { required: true });
</script>

<template>
  <div class="diagram-sidebar__options">
    <div class="diagram-sidebar__toggle">
      <ToggleSwitch v-model="darkMode" input-id="dark-mode" />
      <label for="dark-mode">Dark mode</label>
    </div>
    <div class="diagram-sidebar__toggle">
      <ToggleSwitch v-model="showLabels" input-id="show-labels" />
      <label for="show-labels">Show labels</label>
    </div>
    <div class="diagram-sidebar__toggle">
      <ToggleSwitch v-model="scaleElements" input-id="scale-elements-zoom" />
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

.diagram-sidebar__toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
