<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "openvue/button";
import Checkbox from "openvue/checkbox";
import InputNumber from "openvue/inputnumber";
import InputText from "openvue/inputtext";
import Slider from "openvue/slider";
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

const backgroundImageInput = ref<HTMLInputElement | null>(null);

const backgroundSet = computed(() => (store.getDiagram().backgroundImage ?? "").trim() !== "");

// The slider works in whole percent, so the stored 0-1 opacity scales by 100.
const backgroundOpacityPercent = computed({
  get: () => Math.round((store.getDiagram().backgroundImageOpacity ?? 1) * 100),
  set: (value) => {
    if (typeof value !== "number") return;
    store.setDiagramBackgroundImageOpacity(value / 100);
  },
});

function openBackgroundFile() {
  backgroundImageInput.value?.click();
}

function onBackgroundSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  // FileReader yields the base64 data URL, so the file travels inside the stored json.
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") store.setDiagramBackgroundImage(reader.result);
  };
  reader.readAsDataURL(file);
  input.value = "";
}

function removeBackgroundImage() {
  store.setDiagramBackgroundImage("");
}

const diagramSymmetric = computed({
  get: () => store.getDiagram().symmetric === true,
  set: (value) => {
    if (!isEditor.value) return;
    store.setDiagramSymmetric(value);
  },
});
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
      <label class="diagram-sidebar__mode-label" for="diagram-background-image">Background image</label>
      <template v-if="!backgroundSet">
        <Button
          id="diagram-background-image"
          label="Add background image"
          icon="pi pi-image"
          class="w-full"
          severity="secondary"
          @click="openBackgroundFile"
        />
      </template>
      <template v-else>
        <img class="diagram-sidebar__preview" :src="store.getDiagram().backgroundImage" alt="Rink background preview" />
        <label class="diagram-sidebar__mode-label" for="diagram-background-opacity">Background opacity</label>
        <Slider
          id="diagram-background-opacity"
          v-model="backgroundOpacityPercent"
          class="w-full"
          :min="0"
          :max="100"
          :step="1"
        />
        <Button
          label="Remove background image"
          icon="pi pi-trash"
          class="w-full"
          severity="secondary"
          @click="removeBackgroundImage"
        />
      </template>
      <input ref="backgroundImageInput" type="file" accept="image/*" hidden @change="onBackgroundSelected" />
      <div class="diagram-sidebar__symmetric-checkbox">
        <Checkbox v-model="diagramSymmetric" binary input-id="diagram-symmetric" />
        <label for="diagram-symmetric">Symmetric</label>
      </div>
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

.diagram-sidebar__preview {
  width: 100%;
  max-height: 6rem;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--p-content-border-color);
}

.diagram-sidebar__symmetric-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
