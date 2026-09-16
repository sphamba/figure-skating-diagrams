<script setup lang="ts">
import { computed } from "vue";
import InputNumber from "openvue/inputnumber";
import InputText from "openvue/inputtext";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";

const props = defineProps<{ mode: "home" | "editor"; videoError: boolean }>();

const isEditor = computed(() => props.mode === "editor");

const store = useSequenceEditorStore();

const diagramName = computed({
  get: () => store.getDiagram().name,
  set: (value) => {
    if (!isEditor.value) return;
    store.setDiagramName(value);
  },
});

const diagramBpm = computed({
  get: () => store.getDiagram().bpm,
  set: (value) => {
    if (!isEditor.value) return;
    // The bpm of the canvas editor follows through a watch in EditorView.
    store.setDiagramBpm(typeof value === "number" ? value : undefined);
  },
});

const videoUrl = computed({
  get: () => store.getDiagram().videoUrl ?? "",
  set: (value) => {
    if (!isEditor.value) return;
    store.setDiagramVideoUrl(value);
  },
});

const videoSet = computed(() => videoUrl.value.trim() !== "");
</script>

<template>
  <div class="diagram-sidebar__diagram">
    <template v-if="isEditor">
      <label class="diagram-sidebar__mode-label" for="diagram-name">Diagram name</label>
      <InputText id="diagram-name" v-model="diagramName" class="w-full" />
      <label class="diagram-sidebar__mode-label" for="diagram-bpm">BPM</label>
      <InputNumber
        id="diagram-bpm"
        v-model="diagramBpm"
        :min="1"
        :step="1"
        :use-grouping="false"
        placeholder="120"
        fluid
      />
      <label class="diagram-sidebar__mode-label" for="diagram-video-url">Video URL</label>
      <InputText
        id="diagram-video-url"
        v-model="videoUrl"
        class="w-full"
        :invalid="videoError"
        placeholder="https://example.com/video.mp4"
      />
      <small v-if="videoError" class="diagram-sidebar__load-error">
        The video could not be loaded. Use a direct link to an .mp4 file.
      </small>
    </template>
    <template v-else>
      <label class="diagram-sidebar__mode-label">Diagram name</label>
      <span class="diagram-sidebar__value">{{ diagramName }}</span>
      <template v-if="videoSet">
        <label class="diagram-sidebar__mode-label">Video URL</label>
        <a class="diagram-sidebar__value diagram-sidebar__link" :href="videoUrl" target="_blank" rel="noreferrer">
          {{ videoUrl }}
          <i class="pi pi-external-link pi-sm" aria-label="Open the video in a new tab" />
        </a>
      </template>
      <template v-if="diagramBpm !== undefined">
        <label class="diagram-sidebar__mode-label">BPM</label>
        <span class="diagram-sidebar__value">{{ diagramBpm }}</span>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
.diagram-sidebar__diagram {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
