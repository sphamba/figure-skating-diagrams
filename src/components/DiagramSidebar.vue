<script lang="ts">
export type HelpItem = { keys: string[]; descriptions: string[] };
export type SidebarMode = "home" | "editor";
</script>

<script setup lang="ts">
import { ref } from "vue";
import Drawer from "openvue/drawer";
import Tabs from "openvue/tabs";
import Tab from "openvue/tab";
import TabList from "openvue/tablist";
import TabPanel from "openvue/tabpanel";
import TabPanels from "openvue/tabpanels";
import DiagramSidebarDiagram from "@/components/DiagramSidebarDiagram.vue";
import DiagramSidebarFiles from "@/components/DiagramSidebarFiles.vue";
import DiagramSidebarHelp from "@/components/DiagramSidebarHelp.vue";
import DiagramSidebarOptions from "@/components/DiagramSidebarOptions.vue";
import DiagramSidebarSequences from "@/components/DiagramSidebarSequences.vue";

const props = defineProps<{
  mode: SidebarMode;
  mobile: boolean;
  helpItems: HelpItem[];
  videoError?: boolean;
}>();

// The mobile drawer comes from the playback bar button.
const open = defineModel<boolean>("open", { default: false });
const showLabels = defineModel<boolean>("showLabels", { required: true });
const scaleElements = defineModel<boolean>("scaleElements", { required: true });

const emit = defineEmits<{ "load-start": []; redraw: [] }>();

const activeTab = ref("files");

const sections = [
  { value: "files", label: "Files" },
  { value: "diagram", label: "Diagram" },
  { value: "sequences", label: "Sequences" },
  { value: "options", label: "Options" },
  { value: "help", label: "Help" },
];
</script>

<template>
  <aside v-if="!props.mobile" class="diagram-sidebar">
    <div class="diagram-sidebar__section">
      <div class="diagram-sidebar__section-head">Files</div>
      <DiagramSidebarFiles :mode="props.mode" @load-start="emit('load-start')" />
    </div>

    <div class="diagram-sidebar__section">
      <div class="diagram-sidebar__section-head">Diagram</div>
      <DiagramSidebarDiagram :mode="props.mode" :video-error="props.videoError ?? false" />
    </div>

    <div class="diagram-sidebar__section">
      <div class="diagram-sidebar__section-head">Sequences</div>
      <DiagramSidebarSequences :mode="props.mode" @redraw="emit('redraw')" />
    </div>

    <div class="diagram-sidebar__section">
      <div class="diagram-sidebar__section-head">Options</div>
      <DiagramSidebarOptions v-model:show-labels="showLabels" v-model:scale-elements="scaleElements" />
    </div>

    <div class="diagram-sidebar__section">
      <div class="diagram-sidebar__section-head">Help</div>
      <DiagramSidebarHelp :help-items="props.helpItems" />
    </div>
  </aside>

  <!-- The drawer teleports to body, so the height class needs a global style. -->
  <Drawer v-else v-model:visible="open" position="bottom" modal class="diagram-sidebar__drawer">
    <Tabs v-model:value="activeTab" scrollable class="diagram-sidebar__tabs">
      <TabList>
        <Tab v-for="section in sections" :key="section.value" :value="section.value">{{ section.label }}</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="files">
          <DiagramSidebarFiles :mode="props.mode" @load-start="emit('load-start')" @close="open = false" />
        </TabPanel>
        <TabPanel value="diagram">
          <DiagramSidebarDiagram :mode="props.mode" :video-error="props.videoError ?? false" />
        </TabPanel>
        <TabPanel value="sequences">
          <DiagramSidebarSequences :mode="props.mode" @redraw="emit('redraw')" />
        </TabPanel>
        <TabPanel value="options">
          <DiagramSidebarOptions v-model:show-labels="showLabels" v-model:scale-elements="scaleElements" />
        </TabPanel>
        <TabPanel value="help">
          <DiagramSidebarHelp :help-items="props.helpItems" />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </Drawer>
</template>

<!-- Teleported and regular markup share these styles, so they stay global. -->
<style lang="scss">
.diagram-sidebar {
  display: flex;
  flex-direction: column;
  flex: 0 0 360px;
  width: 360px;
  height: 100%;
  overflow-y: auto;
  padding: 1rem;
  gap: 1.25rem;
  border-right: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
}

.diagram-sidebar__section {
  display: flex;
  flex-direction: column;
}

.diagram-sidebar__section + .diagram-sidebar__section {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--p-content-border-color);
}

.diagram-sidebar__section-head {
  margin-bottom: 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.diagram-sidebar__mode-label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.diagram-sidebar__value {
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.diagram-sidebar__link {
  color: var(--p-primary-color);
  text-decoration: none;
}

.diagram-sidebar__link:hover {
  text-decoration: underline;
}

.diagram-sidebar__load-error {
  margin-top: 0.25rem;
  color: var(--p-form-field-invalid-hover-border-color);
}

/* The aura theme fixes bottom drawers at 10rem and the content at height 100%.
   The theme styles are runtime injected, so these overrides use !important
   and match the drawer root with or without the position ancestor. */
.p-drawer.diagram-sidebar__drawer,
.p-drawer-bottom .p-drawer.diagram-sidebar__drawer {
  height: auto !important;
  max-height: 85vh !important;
}

.p-drawer.diagram-sidebar__drawer .p-drawer-header,
.p-drawer-bottom .p-drawer.diagram-sidebar__drawer .p-drawer-header {
  /* The close icon hugs the drawer edge without a theme padding. */
  padding: 0 !important;
}

.p-drawer.diagram-sidebar__drawer .p-drawer-close-button,
.p-drawer-bottom .p-drawer.diagram-sidebar__drawer .p-drawer-close-button {
  /* A small gap to the drawer edges keeps the touch corner clear */
  /* without pushing the icon away from the content below. */
  margin: 0.25rem 0.25rem 0;
}

.p-drawer.diagram-sidebar__drawer .p-drawer-content,
.p-drawer-bottom .p-drawer.diagram-sidebar__drawer .p-drawer-content {
  height: auto !important;
  /* The sections fill the drawer edge to edge without a theme padding. */
  padding: 0 !important;
  overflow-y: auto;
}
</style>
