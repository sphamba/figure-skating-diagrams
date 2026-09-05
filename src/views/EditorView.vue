<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
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

function addSegment() {
  editor?.addSegmentEnd();
}
</script>

<template>
  <div class="editor-view">
    <aside class="editor-view__panel">
      <h2 class="editor-view__title">Sequence editor</h2>

      <button class="editor-view__button" type="button" @click="openFile">Open JSON</button>
      <button class="editor-view__button" type="button" @click="saveFile">Save JSON</button>
      <button class="editor-view__button" type="button" @click="addSegment">Add segment</button>

      <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFileSelected" />

      <p class="editor-view__hint">
        Wheel to zoom, right click and drag to move, left click and drag the control points to edit the path.
      </p>
    </aside>

    <div class="editor-view__canvas">
      <canvas ref="canvasRef" class="editor-view__canvas-element"></canvas>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/theme" as *;

.editor-view {
  display: flex;
  gap: $space-4;
  height: 80vh;

  &__panel {
    display: flex;
    width: 220px;
    flex-direction: column;
    gap: $space-3;
    padding: $space-4;
    background-color: $color-surface;
    border: 1px solid $color-border;
    border-radius: $radius-base;
  }

  &__title {
    margin: 0 0 $space-2;
    font-size: $font-size-lg;
  }

  &__button {
    padding: $space-2 $space-3;
    background-color: $color-primary;
    color: $color-bg;
    border: none;
    border-radius: $radius-sm;
    cursor: pointer;

    &:hover {
      opacity: 0.9;
    }
  }

  &__hint {
    margin-top: auto;
    color: $color-text-muted;
    font-size: $font-size-sm;
  }

  &__canvas {
    flex: 1;
    min-width: 0;
    border: 1px solid $color-border;
    border-radius: $radius-base;
    overflow: hidden;
  }

  &__canvas-element {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
  }
}
</style>
