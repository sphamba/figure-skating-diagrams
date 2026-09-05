<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import Button from "openvue/button";
import Card from "openvue/card";
import { Editor } from "@/engine/sequenceEditor/editor";
import { Path } from "@/engine/path";
import { Sequence, type SequenceJSON } from "@/engine/sequence";
import type { PatternJSON } from "@/engine/pattern";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

let editor: Editor | null = null;

function emptySequence(): Sequence {
  return new Sequence(new Path());
}

onMounted(async () => {
  if (!canvasRef.value) return;
  editor = new Editor(canvasRef.value, emptySequence());

  // Load the test pattern as a starting point when available.
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}test-pattern.json`);
    const json = (await response.json()) as PatternJSON;
    if (json.sequences?.length) {
      editor.setSequence(Sequence.fromJSON(json.sequences[0] as SequenceJSON));
      // Draw the remaining sequences' paths and foot traces too, so all
      // feet are visible just like on the home page.
      for (const sequence of json.sequences.slice(1)) {
        editor.addOverlaySequence(Sequence.fromJSON(sequence as SequenceJSON));
      }
    }
  } catch {
    // Keep an empty sequence if the example cannot be loaded.
  }
});

onBeforeUnmount(() => {
  editor?.destroy();
  editor = null;
});

function openFile() {
  fileInput.value?.click();
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const json = JSON.parse(await file.text()) as PatternJSON | SequenceJSON;
    const sequence = isPattern(json) ? (json.sequences[0] as SequenceJSON) : json;
    editor?.setSequence(Sequence.fromJSON(sequence));
  } catch (error) {
    console.error("Could not open sequence file:", error);
  } finally {
    input.value = "";
  }
}

function isPattern(json: PatternJSON | SequenceJSON): json is PatternJSON {
  return Array.isArray((json as PatternJSON).sequences);
}

function saveFile() {
  if (!editor) return;
  const json = editor.getSequence().toJSON();
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "sequence.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="editor-view">
    <Card class="editor-view__panel">
      <template #title>Sequence editor</template>
      <template #content>
        <div class="editor-view__actions">
          <Button label="Open JSON" icon="pi pi-folder-open" class="w-full" @click="openFile" />
          <Button label="Save JSON" icon="pi pi-save" class="w-full" severity="secondary" @click="saveFile" />
        </div>

        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFileSelected" />

        <p class="editor-view__hint">
          Wheel to zoom, drag with the left button on empty space or with the right button to move, left click and drag
          the control points to edit the path, and click the arrow near the end of the path to add a segment.
        </p>
      </template>
    </Card>

    <div class="editor-view__canvas">
      <canvas ref="canvasRef" class="editor-view__canvas-element"></canvas>
    </div>
  </div>
</template>

<style scoped>
/* Minimal structural layout only; visual styling comes from OpenVue. */
.editor-view {
  display: flex;
  gap: 1rem;
  height: 80vh;
}

.editor-view .editor-view__panel {
  width: 220px;
  flex-shrink: 0;
}

.editor-view__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.editor-view__hint {
  margin: 1rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.editor-view__canvas {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  overflow: hidden;
}

.editor-view__canvas-element {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}
</style>
