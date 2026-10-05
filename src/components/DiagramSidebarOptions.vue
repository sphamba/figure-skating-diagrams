<script setup lang="ts">
import Select from "openvue/select";
import ToggleSwitch from "openvue/toggleswitch";
import { useI18n } from "vue-i18n";
import { useLocaleStore } from "@/stores/locale";

const { t } = useI18n();
const localeStore = useLocaleStore();

const showLabels = defineModel<boolean>("showLabels", { required: true });
const showLegend = defineModel<boolean>("showLegend", { required: true });
const scaleElements = defineModel<boolean>("scaleElements", { required: true });
const darkMode = defineModel<boolean>("darkMode", { required: true });

// The language names show in their own language at any locale.
const languageOptions = [
  { label: "English", value: "en" },
  { label: "Français", value: "fr" },
];
</script>

<template>
  <div class="diagram-sidebar__options">
    <div class="diagram-sidebar__toggle">
      <ToggleSwitch v-model="darkMode" input-id="dark-mode" />
      <label for="dark-mode">{{ t("options.darkMode") }}</label>
    </div>
    <div class="diagram-sidebar__toggle">
      <ToggleSwitch v-model="showLabels" input-id="show-labels" />
      <label for="show-labels">{{ t("options.showLabels") }}</label>
    </div>
    <div class="diagram-sidebar__toggle">
      <ToggleSwitch v-model="showLegend" input-id="show-legend" />
      <label for="show-legend">{{ t("options.showLegend") }}</label>
    </div>
    <div class="diagram-sidebar__toggle">
      <ToggleSwitch v-model="scaleElements" input-id="scale-elements-zoom" />
      <label for="scale-elements-zoom">{{ t("options.scaleElements") }}</label>
    </div>
    <div class="diagram-sidebar__toggle">
      <label for="language-select">{{ t("options.language") }}</label>
      <Select
        input-id="language-select"
        v-model="localeStore.locale"
        :options="languageOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        class="diagram-sidebar__language"
      />
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

.diagram-sidebar__language {
  flex: 1;
  min-width: 0;
}
</style>
