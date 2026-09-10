<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import Button from "openvue/button";
import Card from "openvue/card";
import Tag from "openvue/tag";
import Fieldset from "openvue/fieldset";
import SelectButton from "openvue/selectbutton";
import Checkbox from "openvue/checkbox";
import Dialog from "openvue/dialog";
import Listbox from "openvue/listbox";
import { Editor, type EditMode } from "@/engine/sequenceEditor/editor";
import type { SequenceJSON } from "@/engine/sequence";
import { changeElementType } from "@/engine/element/turnTypes";
import type { PathCoordinate } from "@/engine/coordinates";
import type { Element } from "@/engine/element/element";
import type { PatternJSON } from "@/engine/pattern";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const editModeOptions = [
  { label: "View", value: "view" },
  { label: "Path", value: "path" },
  { label: "Elements", value: "elements" },
];
const editMode = ref<EditMode>("view");
const scaleElements = ref(true);

const elementChangeOpen = ref(false);
const elementToChange = shallowRef<Element | null>(null);
const elementChangeBranch = ref<"glide" | "stroke" | "turn" | null>(null);
const glidePath = ref<string[]>([]);
const strokePath = ref<string[]>([]);
const turnPath = ref<string[]>([]);

const elementKindGroupOptions = [
  { label: "Glide", value: "glide" },
  { label: "Stroke", value: "stroke" },
  { label: "One-foot turn", value: "turn" },
];

const glideLevelOptions: { label: string; value: string }[][] = [
  [
    { label: "Left", value: "Left" },
    { label: "Right", value: "Right" },
    { label: "Two-foot", value: "TwoFoot" },
  ],
  [
    { label: "Forward", value: "Forward" },
    { label: "Backward", value: "Backward" },
  ],
  [
    { label: "Inside", value: "Inside" },
    { label: "Outside", value: "Outside" },
    { label: "Neither", value: "Neither" },
  ],
];

const strokeLevelOptions: { label: string; value: string }[][] = [
  [
    { label: "Left", value: "Left" },
    { label: "Right", value: "Right" },
  ],
  [
    { label: "Forward", value: "Forward" },
    { label: "Backward", value: "Backward" },
  ],
  [
    { label: "Inside", value: "Inside" },
    { label: "Outside", value: "Outside" },
    { label: "Neither", value: "Neither" },
  ],
  [
    { label: "Normal", value: "Normal" },
    { label: "Crossed", value: "Crossed" },
  ],
];

const turnLevelOptions: { label: string; value: string }[][] = [
  [
    { label: "Three-turn", value: "ThreeTurn" },
    { label: "Bracket", value: "Bracket" },
    { label: "Rocker", value: "Rocker" },
    { label: "Counter", value: "Counter" },
    { label: "Loop", value: "Loop" },
  ],
  [
    { label: "Left", value: "Left" },
    { label: "Right", value: "Right" },
  ],
  [
    { label: "Forward", value: "Forward" },
    { label: "Backward", value: "Backward" },
  ],
  [
    { label: "Inside", value: "Inside" },
    { label: "Outside", value: "Outside" },
  ],
];

const turnStepFinal = computed(() => turnPath.value.length >= turnLevelOptions.length);

const currentTurnOptions = computed(() => (turnStepFinal.value ? [] : turnLevelOptions[turnPath.value.length]));

const glideSideTwoFoot = computed(() => glidePath.value[0] === "TwoFoot");
const glideStepFinal = computed(() => glidePath.value.length >= (glideSideTwoFoot.value ? 2 : 3));

const currentGlideOptions = computed(() => (glideStepFinal.value ? [] : glideLevelOptions[glidePath.value.length]));

const strokeStepFinal = computed(() => strokePath.value.length >= strokeLevelOptions.length);

const currentStrokeOptions = computed(() => (strokeStepFinal.value ? [] : strokeLevelOptions[strokePath.value.length]));

const chosenLabels = computed<string[]>(() => {
  if (!elementChangeBranch.value) return [];
  if (elementChangeBranch.value === "glide") {
    const labels = ["Glide"];
    glidePath.value.forEach((value, level) => {
      const option = glideLevelOptions[level]?.find((choice) => choice.value === value);
      if (option) labels.push(option.label);
    });
    return labels;
  }
  if (elementChangeBranch.value === "stroke") {
    const labels = ["Stroke"];
    strokePath.value.forEach((value, level) => {
      const option = strokeLevelOptions[level]?.find((choice) => choice.value === value);
      if (option) labels.push(option.label);
    });
    return labels;
  }
  const labels = ["One-foot turn"];
  turnPath.value.forEach((value, level) => {
    const option = turnLevelOptions[level]?.find((choice) => choice.value === value);
    if (option) labels.push(option.label);
  });
  return labels;
});

type HelpItem = { keys: string[]; description: string };

const helpItems = computed<HelpItem[]>(() =>
  editMode.value === "view"
    ? [
        { keys: ["wheel"], description: "zoom" },
        { keys: ["right drag"], description: "move the view" },
      ]
    : editMode.value === "elements"
      ? [
          { keys: ["wheel"], description: "zoom" },
          { keys: ["right drag"], description: "move the view" },
          { keys: ["left drag"], description: "on empty space: draw a selection rectangle" },
          { keys: ["left click"], description: "on the path: create a provisional element" },
          { keys: ["left drag"], description: "on the path: create a provisional element over the dragged range" },
          { keys: ["drag"], description: "a provisional element: move it or its ends" },
          { keys: ["+"], description: "on the provisional element: add it to the sequence" },
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
          { keys: ["−"], description: "button beside a selected point: remove that point" },
        ],
);

let editor: Editor | null = null;

const store = useSequenceEditorStore();

const clearOpen = ref(false);

watch(editMode, (mode) => {
  if (editor) {
    editor.mode = mode;
    editor.clearSelection();
    editor.draw();
  }
});
watch(
  scaleElements,
  (value) => {
    if (editor) {
      editor.scaleElements = value;
      editor.draw();
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (!canvasRef.value) return;
  editor = new Editor(canvasRef.value, store.getSequence());

  editor.onElementChangeRequest = (element) => {
    elementToChange.value = element;
    elementChangeBranch.value = null;
    glidePath.value = [];
    turnPath.value = [];
    elementChangeOpen.value = true;
  };
  editor.onSequenceChange = () => store.saveToStorage();
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
    store.loadFromJSON(sequence);
    editor?.setSequence(store.getSequence());
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
  const blob = new Blob([store.toJSON()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "sequence.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function changeElementKind(kind: string) {
  if (!editor || !elementToChange.value) return;
  const current = elementToChange.value as Element;
  const template = current.toJSON() as { type: string; start: PathCoordinate; end: PathCoordinate };
  const replacement = changeElementType(kind, { ...template, type: kind });
  const sequence = editor.getSequence();
  sequence.replaceElement(current, replacement);
  editor.replaceSelectedElement(current, replacement);
  elementToChange.value = replacement;
  store.saveToStorage();
  editor.draw();
}

function onClearConfirmed() {
  store.clear();
  editor?.setSequence(store.getSequence());
  closeClear();
}

function closeClear() {
  clearOpen.value = false;
}

function chooseElementBranch(branch: "glide" | "stroke" | "turn") {
  elementChangeBranch.value = branch;
  glidePath.value = [];
  strokePath.value = [];
  turnPath.value = [];
}

function onGlideChange(value: string) {
  const next = [...glidePath.value, value];
  if (next.length < (next[0] === "TwoFoot" ? 2 : 3)) {
    glidePath.value = next;
    return;
  }
  const [side, direction, edge] = next;
  const type =
    side === "TwoFoot" ? `Both${direction}Glide` : `${side}${direction}${edge === "Neither" ? "" : edge}Glide`;
  changeElementKind(type);
  closeElementChange();
}

function onStrokeChange(value: string) {
  const next = [...strokePath.value, value];
  if (next.length < strokeLevelOptions.length) {
    strokePath.value = next;
    return;
  }
  const [side, direction, edge, crossed] = next;
  changeElementKind(`${side}${crossed}${direction}${edge === "Neither" ? "" : edge}Glide`);
  closeElementChange();
}

function onTurnChange(value: string) {
  const next = [...turnPath.value, value];
  if (next.length < turnLevelOptions.length) {
    turnPath.value = next;
    return;
  }
  const [group, side, direction, edge] = next;
  changeElementKind(`${side}${direction}${edge}${group}`);
  closeElementChange();
}

function previousElementChangeStep() {
  if (elementChangeBranch.value === "glide" && glidePath.value.length > 0) {
    glidePath.value = glidePath.value.slice(0, -1);
    return;
  }
  if (elementChangeBranch.value === "stroke" && strokePath.value.length > 0) {
    strokePath.value = strokePath.value.slice(0, -1);
    return;
  }
  if (elementChangeBranch.value === "turn" && turnPath.value.length > 0) {
    turnPath.value = turnPath.value.slice(0, -1);
    return;
  }
  elementChangeBranch.value = null;
}

function closeElementChange() {
  elementChangeOpen.value = false;
}
</script>

<template>
  <div class="editor-view">
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
              :allow-empty="false"
              class="w-full"
            />
            <div v-if="editMode !== 'elements'" class="editor-view__scale-checkbox">
              <Checkbox v-model="scaleElements" binary input-id="scale-elements" />
              <label for="scale-elements">Scale elements</label>
            </div>
          </div>

          <div class="editor-view__actions">
            <Button label="Open JSON" icon="pi pi-folder-open" class="w-full" severity="secondary" @click="openFile" />
            <Button label="Save JSON" icon="pi pi-save" class="w-full" severity="secondary" @click="saveFile" />
            <Button label="Clear" icon="pi pi-trash" class="w-full" severity="danger" @click="clearOpen = true" />
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

    <div class="editor-view__canvas">
      <canvas ref="canvasRef" class="editor-view__canvas-element"></canvas>
    </div>

    <Dialog
      v-model:visible="elementChangeOpen"
      header="Element selection"
      modal
      class="editor-view__element-dialog"
      @hide="closeElementChange"
    >
      <template v-if="!elementChangeBranch">
        <Listbox
          :model-value="elementChangeBranch"
          :options="elementKindGroupOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          @change="(event) => chooseElementBranch(event.value)"
        />
      </template>

      <template v-else>
        <div class="editor-view__element-kind">
          <Tag v-for="label in chosenLabels" :key="label" :value="label" />
        </div>

        <Listbox
          v-if="elementChangeBranch === 'glide'"
          :model-value="null"
          :options="currentGlideOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          @change="(event) => onGlideChange(event.value)"
        />

        <Listbox
          v-else-if="elementChangeBranch === 'stroke'"
          :model-value="null"
          :options="currentStrokeOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          @change="(event) => onStrokeChange(event.value)"
        />

        <Listbox
          v-else
          :model-value="null"
          :options="currentTurnOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          @change="(event) => onTurnChange(event.value)"
        />
      </template>

      <template #footer>
        <Button
          v-if="elementChangeBranch"
          label="Previous"
          severity="secondary"
          icon="pi pi-arrow-left"
          @click="previousElementChangeStep"
        />
        <Button label="Close" severity="secondary" icon="pi pi-times" @click="closeElementChange" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="clearOpen"
      header="Clear sequence"
      modal
      class="editor-view__clear-dialog"
      @hide="closeClear"
    >
      <p>Put back the default sequence? The current sequence will be lost.</p>
      <template #footer>
        <Button label="Cancel" severity="secondary" icon="pi pi-times" @click="closeClear" />
        <Button label="Clear" severity="danger" icon="pi pi-trash" @click="onClearConfirmed" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped lang="scss">
.editor-view {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.editor-view__sidebar {
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

.editor-view__scale-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

.editor-view__element-dialog {
  width: 320px;
}

.editor-view__clear-dialog {
  width: 320px;
}

.editor-view__element-kind {
  display: flex;
  margin-bottom: 0.5rem;
}
</style>
