<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import Button from "openvue/button";
import Card from "openvue/card";
import Tag from "openvue/tag";
import Fieldset from "openvue/fieldset";
import SelectButton from "openvue/selectbutton";
import Checkbox from "openvue/checkbox";
import Dialog from "openvue/dialog";
import InputText from "openvue/inputtext";
import Listbox from "openvue/listbox";
import ToggleSwitch from "openvue/toggleswitch";
import Inplace from "openvue/inplace";
import ConfirmPopup from "openvue/confirmpopup";
import { useConfirm } from "openvue/useconfirm";
import { Editor, type EditMode } from "@/engine/sequenceEditor/editor";
import type { Sequence, SequenceJSON } from "@/engine/sequence";
import { changeElementType } from "@/engine/element/turnTypes";
import type { PathCoordinate } from "@/engine/coordinates";
import type { Element } from "@/engine/element/element";
import type { PatternJSON } from "@/engine/pattern";
import type { DiagramJSON } from "@/engine/diagram";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";
import { useMediaQuery } from "@/composables/useMediaQuery";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const editModeOptions = [
  { label: "View", value: "view" },
  { label: "Path", value: "path" },
  { label: "Elements", value: "elements" },
];
const editMode = ref<EditMode>("view");
const scaleElements = ref(true);

const isMobile = useMediaQuery("(max-width: 767.98px)");
const sidebarOpen = ref(true);

watch(isMobile, (mobile) => {
  sidebarOpen.value = !mobile;
});

const elementChangeOpen = ref(false);
const elementToChange = shallowRef<Element | null>(null);
const elementChangeBranch = ref<"glide" | "stroke" | "turn" | "twoFeetTurn" | null>(null);
const glidePath = ref<string[]>([]);
const strokePath = ref<string[]>([]);
const turnPath = ref<string[]>([]);
const twoFeetPath = ref<string[]>([]);

const elementKindGroupOptions = [
  { label: "Glide", value: "glide" },
  { label: "Stroke", value: "stroke" },
  { label: "One-foot turn", value: "turn" },
  { label: "Two-feet turn", value: "twoFeetTurn" },
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
    { label: "Crossed back", value: "CrossedBack" },
  ],
];

const turnGroupOptions = [
  { label: "Three-turn", value: "ThreeTurn" },
  { label: "Bracket", value: "Bracket" },
  { label: "Rocker", value: "Rocker" },
  { label: "Counter", value: "Counter" },
  { label: "Loop", value: "Loop" },
  { label: "Twizzle", value: "Twizzle" },
];

const turnSideLevelOptions = [
  { label: "Left", value: "Left" },
  { label: "Right", value: "Right" },
];

const turnDirectionLevelOptions = [
  { label: "Forward", value: "Forward" },
  { label: "Backward", value: "Backward" },
];

const turnEdgeLevelOptions = [
  { label: "Inside", value: "Inside" },
  { label: "Outside", value: "Outside" },
];

const twoFeetTurnGroupOptions = [
  { label: "Mohawk", value: "Mohawk" },
  { label: "Choctaw", value: "Choctaw" },
];

const twoFeetTurnOpennessLevelOptions = [
  { label: "Open", value: "Open" },
  { label: "Closed", value: "Closed" },
];

const twoFeetTurnLevelOptionsByGroup: { [group: string]: { label: string; value: string }[][] } = {
  Mohawk: [turnSideLevelOptions, turnDirectionLevelOptions, twoFeetTurnOpennessLevelOptions],
  Choctaw: [turnSideLevelOptions, turnDirectionLevelOptions, twoFeetTurnOpennessLevelOptions],
};

const twoFeetTurnStepCounts: { [group: string]: number } = {
  Mohawk: 4,
  Choctaw: 4,
};

const twizzleTurnsLevelOptions = [
  { label: "1/2 turn", value: "0.5" },
  { label: "1 turn", value: "1" },
  { label: "1-1/2 turns", value: "1.5" },
  { label: "2 turns", value: "2" },
  { label: "2-1/2 turns", value: "2.5" },
  { label: "3 turns", value: "3" },
  { label: "3-1/2 turns", value: "3.5" },
  { label: "4 turns", value: "4" },
  { label: "4-1/2 turns", value: "4.5" },
  { label: "5 turns", value: "5" },
  { label: "5-1/2 turns", value: "5.5" },
];

const turnLevelOptionsByGroup: { [group: string]: { label: string; value: string }[][] } = {
  ThreeTurn: [turnSideLevelOptions, turnDirectionLevelOptions, turnEdgeLevelOptions],
  Bracket: [turnSideLevelOptions, turnDirectionLevelOptions, turnEdgeLevelOptions],
  Rocker: [turnSideLevelOptions, turnDirectionLevelOptions, turnEdgeLevelOptions],
  Counter: [turnSideLevelOptions, turnDirectionLevelOptions, turnEdgeLevelOptions],
  Loop: [turnSideLevelOptions, turnDirectionLevelOptions, turnEdgeLevelOptions],
  Twizzle: [turnSideLevelOptions, turnDirectionLevelOptions, turnEdgeLevelOptions, twizzleTurnsLevelOptions],
};

const turnStepCounts: { [group: string]: number } = {
  ThreeTurn: 4,
  Bracket: 4,
  Rocker: 4,
  Counter: 4,
  Loop: 4,
  Twizzle: 5,
};

const turnGroup = computed(() => turnPath.value[0] ?? "");

const turnStepFinal = computed(() => turnPath.value.length >= (turnStepCounts[turnGroup.value] ?? 1));

const currentTurnOptions = computed(() => {
  if (turnStepFinal.value) return [];
  if (turnPath.value.length === 0) return turnGroupOptions;
  return turnLevelOptionsByGroup[turnGroup.value]?.[turnPath.value.length - 1] ?? [];
});

const twoFeetTurnGroup = computed(() => twoFeetPath.value[0] ?? "");

const twoFeetTurnStepFinal = computed(() => twoFeetPath.value.length >= (twoFeetTurnStepCounts[twoFeetTurnGroup.value] ?? 1));

const currentTwoFeetTurnOptions = computed(() => {
  if (twoFeetTurnStepFinal.value) return [];
  if (twoFeetPath.value.length === 0) return twoFeetTurnGroupOptions;
  return twoFeetTurnLevelOptionsByGroup[twoFeetTurnGroup.value]?.[twoFeetPath.value.length - 1] ?? [];
});

const glideSideTwoFoot = computed(() => glidePath.value[0] === "TwoFoot");
const glideStepFinal = computed(() => glidePath.value.length >= (glideSideTwoFoot.value ? 2 : 3));

const currentGlideOptions = computed(() => (glideStepFinal.value ? [] : glideLevelOptions[glidePath.value.length]));

const strokeStepFinal = computed(() => strokePath.value.length >= strokeLevelOptions.length);

const currentStrokeOptions = computed(() => (strokeStepFinal.value ? [] : strokeLevelOptions[strokePath.value.length]));

const chosenLabels = computed<string[]>(() => {
  if (!elementChangeBranch.value) return [];
  if (elementChangeBranch.value === "twoFeetTurn") {
    const labels = ["Two-feet turn"];
    twoFeetPath.value.forEach((value, level) => {
      const options: { label: string; value: string }[] | undefined =
        level === 0 ? twoFeetTurnGroupOptions : twoFeetTurnLevelOptionsByGroup[twoFeetTurnGroup.value]?.[level - 1];
      const option = options?.find((choice) => choice.value === value);
      if (option) labels.push(option.label);
    });
    return labels;
  }
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
    const options: { label: string; value: string }[] | undefined =
      level === 0 ? turnGroupOptions : turnLevelOptionsByGroup[turnGroup.value]?.[level - 1];
    const option = options?.find((choice) => choice.value === value);
    if (option) labels.push(option.label);
  });
  return labels;
});

type HelpItem = { keys: string[]; description: string };

const touchHelpItems: HelpItem[] = [
  { keys: ["two fingers"], description: "pinch to zoom and drag to move the view" },
  { keys: ["one finger"], description: "same as a left click" },
];

const helpItems = computed<HelpItem[]>(() =>
  editMode.value === "view"
    ? [
        { keys: ["wheel"], description: "zoom" },
        { keys: ["right drag"], description: "move the view" },
        ...touchHelpItems,
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
          ...touchHelpItems,
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
          ...touchHelpItems,
        ],
);

let editor: Editor | null = null;

const store = useSequenceEditorStore();

const sequences = computed(() => store.getSequences());
const activeSequence = computed(() => store.getActiveSequence());
const visibleSequences = computed(() => sequences.value.filter((sequence) => store.isVisible(sequence)));
const diagramName = computed({
  get: () => store.getDiagram().name,
  set: (value) => store.setDiagramName(value),
});

const confirm = useConfirm();

const sequenceNames = computed(
  () => new Map(store.getSequences().map((sequence) => [sequence, sequence.name] as const)),
);

const renameDraft = ref("");
const renamingTarget = shallowRef<Sequence | null>(null);

function startRename(sequence: Sequence) {
  renamingTarget.value = sequence;
  renameDraft.value = sequence.name;
}

function commitRename() {
  const sequence = renamingTarget.value;
  if (!sequence) return;
  const name = renameDraft.value.trim();
  if (name && name !== sequence.name) store.renameSequence(sequence, name);
  renamingTarget.value = null;
}

function cancelRename() {
  renamingTarget.value = null;
}

const selectedSequence = computed({
  get: () => activeSequence.value,
  set: (value) => {
    if (value) store.setActiveSequence(value);
  },
});

const confirmPopupRef = ref<{ alignOverlay: () => void } | null>(null);

function confirmDelete(sequence: Sequence, event: Event) {
  confirm.require({
    group: "editor-delete",
    target: event.currentTarget as HTMLElement,
    message: `Delete "${sequence.name}"? This cannot be undone.`,
    icon: "pi pi-exclamation-triangle",
    rejectLabel: "Cancel",
    acceptLabel: "Delete",
    rejectProps: { severity: "secondary", text: true },
    acceptProps: { severity: "danger" },
    accept: () => store.removeSequence(sequence),
    onShow: () => {
      nextTick(() => {
        requestAnimationFrame(() => confirmPopupRef.value?.alignOverlay());
      });
    },
  });
}

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
  if (visibleSequences.value.length === 0) return;
  editor = new Editor(canvasRef.value, visibleSequences.value);

  editor.onElementChangeRequest = (element) => {
    elementToChange.value = element;
    elementChangeBranch.value = null;
    glidePath.value = [];
    turnPath.value = [];
    twoFeetPath.value = [];
    elementChangeOpen.value = true;
  };
  editor.onSequenceChange = () => store.saveToStorage();
});

watch(visibleSequences, (list) => {
  if (editor) editor.setSequences(list);
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
    const json = JSON.parse(await file.text()) as PatternJSON | DiagramJSON | SequenceJSON;
    if (isPattern(json)) {
      store.loadFromJSON({ name: json.name, sequences: json.sequences });
    } else if (isSequenceJSON(json)) {
      store.loadFromJSON({ name: "Diagram", sequences: [json] });
    } else {
      store.loadFromJSON(json);
    }
  } catch (error) {
    console.error("Could not open diagram file:", error);
  } finally {
    input.value = "";
  }
}

function isPattern(json: PatternJSON | DiagramJSON | SequenceJSON): json is PatternJSON {
  return Array.isArray((json as PatternJSON).sequences);
}

function isSequenceJSON(json: PatternJSON | DiagramJSON | SequenceJSON): json is SequenceJSON {
  return "path" in json && "keyframes" in json;
}

function saveFile() {
  if (!editor) return;
  const blob = new Blob([store.toJSON()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "diagram.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function changeElementKind(kind: string) {
  if (!editor || !elementToChange.value) return;
  const current = elementToChange.value as Element;
  const template = current.toJSON() as { type: string; start: PathCoordinate; end: PathCoordinate };
  const replacement = changeElementType(kind, { ...template, type: kind });
  const sequence = editor.replaceElementOf(current, replacement);
  if (!sequence) return;
  elementToChange.value = replacement;
  store.saveToStorage();
  editor.draw();
}

function onClearConfirmed() {
  store.clear();
  closeClear();
}

function closeClear() {
  clearOpen.value = false;
}

function chooseElementBranch(branch: "glide" | "stroke" | "turn" | "twoFeetTurn") {
  elementChangeBranch.value = branch;
  glidePath.value = [];
  strokePath.value = [];
  turnPath.value = [];
  twoFeetPath.value = [];
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
  if (next.length < (turnStepCounts[next[0] ?? ""] ?? 1)) {
    turnPath.value = next;
    return;
  }
  if (next[0] === "Twizzle") {
    const [, side, direction, edge, turns] = next;
    changeElementKind(`${side}${direction}${edge}Twizzle${turns}`);
  } else {
    const [group, side, direction, edge] = next;
    changeElementKind(`${side}${direction}${edge}${group}`);
  }
  closeElementChange();
}

function onTwoFeetTurnChange(value: string) {
  const next = [...twoFeetPath.value, value];
  if (next.length < 4) {
    twoFeetPath.value = next;
    return;
  }
  const [group, side, direction, openness] = next;
  changeElementKind(`${side}${direction}${openness}${group}`);
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
  if (elementChangeBranch.value === "twoFeetTurn" && twoFeetPath.value.length > 0) {
    twoFeetPath.value = twoFeetPath.value.slice(0, -1);
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
    <aside v-if="!isMobile || sidebarOpen" class="editor-view__sidebar">
      <Card class="editor-view__panel">
        <template #title>
          <div class="editor-view__panel-title">
            <span>Sequence editor</span>
            <Button
              v-if="isMobile"
              icon="pi pi-times"
              aria-label="Close panel"
              severity="secondary"
              text
              rounded
              size="small"
              @click="sidebarOpen = false"
            />
          </div>
        </template>
        <template #content>
          <div v-if="editMode !== 'elements'" class="editor-view__actions">
            <div class="editor-view__scale-checkbox">
              <Checkbox v-model="scaleElements" binary input-id="scale-elements" />
              <label for="scale-elements">Scale elements</label>
            </div>
          </div>

          <div class="editor-view__actions">
            <label class="editor-view__mode-label">Diagram</label>
            <InputText v-model="diagramName" class="w-full" />
          </div>

          <div class="editor-view__actions">
            <label class="editor-view__mode-label">Sequences</label>
            <Listbox
              v-model="selectedSequence"
              :options="sequences"
              option-label="name"
              class="editor-view__sequence-list"
            >
              <template #option="{ option }">
                <ToggleSwitch
                  :model-value="store.isVisible(option)"
                  :aria-label="store.isVisible(option) ? 'Hide sequence' : 'Show sequence'"
                  @update:model-value="store.toggleVisible(option)"
                  @click.stop
                />
                <Inplace
                  class="editor-view__sequence-name"
                  :active="renamingTarget === option"
                  @click.stop
                  @open="startRename(option)"
                  @keyup.enter="commitRename"
                  @keyup.esc="cancelRename"
                >
                  <template #display>{{ sequenceNames.get(option) }}</template>
                  <template #content>
                    <InputText v-model="renameDraft" @keydown.stop />
                  </template>
                </Inplace>
                <Button
                  icon="pi pi-trash"
                  aria-label="Delete sequence"
                  severity="danger"
                  text
                  rounded
                  size="small"
                  @click.stop="confirmDelete(option, $event)"
                />
              </template>
            </Listbox>
            <Button
              label="Add sequence"
              icon="pi pi-plus"
              severity="secondary"
              text
              class="editor-view__add-sequence"
              @click="store.addSequence()"
            />
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

    <div v-if="isMobile && sidebarOpen" class="editor-view__backdrop" @click="sidebarOpen = false"></div>

    <div class="editor-view__canvas">
      <div class="editor-view__floating">
        <Button
          v-if="isMobile && !sidebarOpen"
          icon="pi pi-bars"
          aria-label="Open panel"
          severity="secondary"
          rounded
          @click="sidebarOpen = true"
        />
        <SelectButton
          v-model="editMode"
          :options="editModeOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
        />
      </div>
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
          scroll-height=""
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
          scroll-height=""
          class="w-full"
          @change="(event) => onGlideChange(event.value)"
        />

        <Listbox
          v-else-if="elementChangeBranch === 'stroke'"
          :model-value="null"
          :options="currentStrokeOptions"
          option-label="label"
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => onStrokeChange(event.value)"
        />

        <Listbox
          v-else-if="elementChangeBranch === 'turn'"
          :model-value="null"
          :options="currentTurnOptions"
          option-label="label"
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => onTurnChange(event.value)"
        />

        <Listbox
          v-else
          :model-value="null"
          :options="currentTwoFeetTurnOptions"
          option-label="label"
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => onTwoFeetTurnChange(event.value)"
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
      header="Clear diagram"
      modal
      class="editor-view__clear-dialog"
      @hide="closeClear"
    >
      <p>Put back the default diagram? The current diagram will be lost.</p>
      <template #footer>
        <Button label="Cancel" severity="secondary" icon="pi pi-times" @click="closeClear" />
        <Button label="Clear" severity="danger" icon="pi pi-trash" @click="onClearConfirmed" />
      </template>
    </Dialog>

    <ConfirmPopup ref="confirmPopupRef" group="editor-delete" />
  </div>
</template>

<style scoped lang="scss">
.editor-view {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
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

.editor-view__panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
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

.editor-view__sequence-list {
  width: 100%;
}

.editor-view__sequence-list :deep(.p-listbox-option) {
  width: 100%;
  padding-block: 0.2rem;
}

.editor-view__sequence-name {
  flex: 1;
  min-width: 0;
}

.editor-view__add-sequence {
  align-self: flex-start;
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
  position: relative;
}

.editor-view__floating {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 30;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.editor-view__backdrop {
  position: absolute;
  inset: 0;
  z-index: 35;
  background: rgba(0, 0, 0, 0.4);
}

@media (max-width: 767.98px) {
  .editor-view__sidebar {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 40;
    flex: none;
    width: min(360px, 85vw);
    box-shadow: 0.5rem 0 1.5rem rgba(0, 0, 0, 0.2);
  }
}

.editor-view__canvas-element {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  cursor: default;
  touch-action: none;
}

.editor-view__element-kind {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}
</style>

<!-- Dialog root teleports to body, scoped attributes never reach it -->
<style lang="scss">
.editor-view__element-dialog {
  width: 320px;
  max-width: 90vw;
  min-width: 0;
  height: 400px;
  display: flex;
  flex-direction: column;
}

.editor-view__element-dialog .p-dialog-content {
  display: flex;
  flex-direction: column;
}

.editor-view__element-dialog .p-listbox {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.editor-view__element-dialog .p-listbox-list-container {
  flex: 1;
  min-height: 0;
}
</style>
