<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "openvue/button";
import Card from "openvue/card";
import Tag from "openvue/tag";
import Fieldset from "openvue/fieldset";
import SelectButton from "openvue/selectbutton";
import { Editor, type EditMode } from "@/engine/sequenceEditor/editor";
import { Path } from "@/engine/path";
import { Sequence, type SequenceJSON } from "@/engine/sequence";
import type { PatternJSON } from "@/engine/pattern";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const editModeOptions = [
  { label: "Path", value: "path" },
  { label: "Elements", value: "elements" },
];
const editMode = ref<EditMode>("path");

/** A help line: one or more input gestures shown as pills, plus a description. */
type HelpItem = { keys: string[]; description: string };

/** Help commands that are actually usable in the current edit mode. */
const helpItems = computed<HelpItem[]>(() =>
  editMode.value === "elements"
    ? [
        { keys: ["wheel"], description: "zoom" },
        { keys: ["right drag"], description: "move the view" },
      ]
    : [
        { keys: ["wheel"], description: "zoom" },
        { keys: ["left click"], description: "on a control point: select it" },
        { keys: ["left click"], description: "on a line: select that curve" },
        { keys: ["drag"], description: "a selected curve: move it (and the others selected)" },
        { keys: ["left drag"], description: "on empty space: draw a selection rectangle" },
        { keys: ["drag"], description: "one of the selected points: move all selected points" },
        { keys: ["ctrl", "left click"], description: "add or remove from the selection" },
        { keys: ["ctrl", "A"], description: "select all" },
        { keys: ["right drag"], description: "move the view" },
        { keys: ["+"], description: "button near the end of the path: add a segment" },
        { keys: ["+"], description: "button at the midpoint of a selected curve: split it" },
        { keys: ["-"], description: "button beside a selected point: remove that point" },
      ],
);

let editor: Editor | null = null;

watch(editMode, (mode) => {
  if (editor) {
    editor.mode = mode;
    // Unselect everything when switching modes (e.g. path -> elements).
    editor.clearSelection();
    editor.draw();
  }
});

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
    <!-- Fixed-width sidebar, flush with the left edge of the screen. -->
    <aside class="editor-view__sidebar">
      <Card class="editor-view__panel">
        <template #title>Sequence editor</template>
        <template #content>
          <div class="editor-view__actions">
            <label class="editor-view__mode-label">Edit mode</label>
            <SelectButton
              v-model="editMode"
              :options="editModeOptions"
              option-label="label"
              option-value="value"
              class="w-full"
            />
          </div>

          <div class="editor-view__actions">
            <Button label="Open JSON" icon="pi pi-folder-open" class="w-full" @click="openFile" />
            <Button label="Save JSON" icon="pi pi-save" class="w-full" severity="secondary" @click="saveFile" />
          </div>

          <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFileSelected" />

          <Fieldset legend="Input help" toggleable class="editor-view__help">
            <ul class="editor-view__hint">
              <li v-for="item in helpItems" :key="item.description" class="editor-view__hint-item">
                <span class="editor-view__hint-keys">
                  <template v-for="(key, index) in item.keys" :key="key">
                    <Tag :value="key" rounded />
                    <span v-if="index < item.keys.length - 1" class="editor-view__hint-separator">+</span>
                  </template>
                </span>
                <span class="editor-view__hint-desc">{{ item.description }}</span>
              </li>
            </ul>
          </Fieldset>
        </template>
      </Card>
    </aside>

    <!-- The canvas takes all remaining horizontal space. -->
    <div class="editor-view__canvas">
      <canvas ref="canvasRef" class="editor-view__canvas-element"></canvas>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* Minimal structural layout only; visual styling comes from OpenVue. */
.editor-view {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.editor-view__sidebar {
  // Fixed width regardless of the viewport (not a percentage).
  flex: 0 0 360px;
  width: 360px;
  height: 100%;
  overflow-y: auto;
}

.editor-view__panel {
  border-radius: 0;
  height: 100%;
}

.editor-view__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.editor-view__actions + .editor-view__actions {
  margin-top: 1rem;
}

.editor-view__mode-label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.editor-view__help {
  margin-top: 1rem;
}

.editor-view__hint {
  margin: 0;
  padding: 0;
  list-style: none;
}

.editor-view__hint-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.editor-view__hint-keys {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.editor-view__hint-separator {
  display: flex;
  align-items: center;
  color: var(--p-text-muted-color);
}

.editor-view__hint-desc {
  color: var(--p-text-muted-color);
}

.editor-view__canvas {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}

.editor-view__canvas-element {
  display: block;
  width: 100%;
  height: 100%;
  cursor: default;
}
</style>
