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
import InputNumber from "openvue/inputnumber";
import InputGroup from "openvue/inputgroup";
import InputGroupAddon from "openvue/inputgroupaddon";
import Listbox from "openvue/listbox";
import ColorPicker from "openvue/colorpicker";
import ToggleSwitch from "openvue/toggleswitch";
import Inplace from "openvue/inplace";
import ConfirmPopup from "openvue/confirmpopup";
import { useConfirm } from "openvue/useconfirm";
import { Editor, formatTimingLabel, type EditMode } from "@/engine/sequenceEditor/editor";
import { TimingKeyframe, type TimingKind } from "@/engine/keyframe";
import type { Sequence, SequenceJSON, FootKey } from "@/engine/sequence";
import { changeElementType } from "@/engine/element/turnTypes";
import { parseVariantFlags, type VariantFlags } from "@/engine/element/variantFlags";
import { checkTurnVariantValidity, type TurnVariantValidity } from "@/engine/sequenceEditor/variantValidation";
import { OneFootTurn } from "@/engine/element/oneFootTurn";
import { TwoFeetTurn } from "@/engine/element/twoFeetTurn";
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
  { label: "Timing", value: "timing" },
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
const isProvisionalTarget = ref(false);
const oldVariant = ref<VariantFlags | null>(null);
const validVariant = ref<TurnVariantValidity | null>(null);
const oldKind = ref<"glide" | "stroke" | "turn" | "twoFeetTurn" | null>(null);
const pendingReplacement = shallowRef<Element | null>(null);
const shortNameDraft = ref("");
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
    { label: "Two-feet", value: "TwoFoot" },
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

const twoFeetTurnStepFinal = computed(
  () => twoFeetPath.value.length >= (twoFeetTurnStepCounts[twoFeetTurnGroup.value] ?? 1),
);

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

type ElementKind = "glide" | "stroke" | "turn" | "twoFeetTurn";

function kindOfType(type: string): ElementKind {
  const flags = parseVariantFlags(type);
  if (flags.stroke) return "stroke";
  if (flags.openness) return "twoFeetTurn";
  if (flags.group) return "turn";
  return "glide";
}

function oldValueAt(branch: ElementKind, level: number, value: string): boolean {
  const flags = oldVariant.value;
  if (!flags) return false;
  if (branch === "glide") {
    if (level === 0) return value === (flags.twoFoot ? "TwoFoot" : flags.side);
    if (level === 1) return value === flags.direction;
    if (level === 2) return !flags.twoFoot && value === flags.edge;
    return false;
  }
  if (branch === "stroke") {
    if (level === 0) return value === flags.side;
    if (level === 1) return value === flags.direction;
    if (level === 2) return value === flags.edge;
    if (level === 3) return value === flags.stroke;
    return false;
  }
  if (branch === "turn") {
    if (level === 0) return value === flags.group;
    if (level === 1) return value === flags.side;
    if (level === 2) return value === flags.direction;
    if (level === 3) return value === flags.edge;
    if (level === 4) return flags.group === "Twizzle" && value === flags.turns;
    return false;
  }
  if (level === 0) return value === flags.group;
  if (level === 1) return value === flags.side;
  if (level === 2) return value === flags.direction;
  return level === 3 && value === flags.openness;
}

// Marks the flag values the geometry computes as valid at the element start
// point. The side and direction levels apply to both turn branches; the edge
// level only exists in the one-foot turn branch, so openness and the twizzle
// turn counts get no check.
function validFlagAt(branch: ElementKind, level: number, value: string): boolean {
  const v = validVariant.value;
  if (!v) return false;
  if (level === 1) return v.left !== null && value === (v.left ? "Left" : "Right");
  if (level === 2) return v.forward !== null && value === (v.forward ? "Forward" : "Backward");
  if (branch === "turn" && level === 3) return v.inside !== null && value === (v.inside ? "Inside" : "Outside");
  return false;
}

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
    : editMode.value === "timing"
      ? [
          { keys: ["wheel"], description: "zoom" },
          { keys: ["right drag"], description: "move the view" },
          { keys: ["left drag"], description: "on empty space: draw a selection rectangle" },
          { keys: ["left click"], description: "on a timing point: select it" },
          { keys: ["ctrl", "left click"], description: "add or remove from the selection" },
          { keys: ["left click"], description: "on the path: create a provisional timing point" },
          {
            keys: ["left drag"],
            description: "on the path: create a provisional timing point at the release position",
          },
          { keys: ["drag"], description: "a timing point: move it" },
          { keys: ["+"], description: "button on the provisional timing point: open the timing keyframe dialog" },
          { keys: ["cog"], description: "on a selected timing point: open the timing keyframe dialog" },
          { keys: ["−"], description: "button beside a selected timing point: remove it" },
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
            { keys: ["+"], description: "on the provisional element: open the element selection dialog" },
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

const diagramBpm = computed({
  get: () => store.getDiagram().bpm,
  set: (value) => {
    if (typeof value === "number") store.setDiagramBpm(value);
    editor?.draw();
  },
});

const timingTypeOptions = [
  { label: "Time", value: "time" },
  { label: "Beats", value: "beats" },
];
const timingKeyframeOpen = ref(false);
const timingTarget = shallowRef<TimingKeyframe | null>(null);
const timingIsProvisional = ref(false);
const timingKind = ref<TimingKind>("time");
const timingValueDraft = ref("");
const timingValueError = ref<"format" | "bounds" | null>(null);
const timingValueInvalid = computed(() => timingValueError.value !== null);
const timingOriginalKind = ref<TimingKind | null>(null);
const timingOriginalValue = ref<number | null>(null);
const timingPreviousValue = ref<number | null>(null);

function formatTimingValue(value: number): string {
  const totalSeconds = Math.max(0, Math.ceil(value - 1e-9));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const confirm = useConfirm();

const sequenceInfos = computed(
  () =>
    new Map(
      store
        .getSequences()
        .map(
          (sequence) =>
            [sequence, { name: sequence.name, footL: sequence.traceColorL, footR: sequence.traceColorR }] as const,
        ),
    ),
);

const footSwatches = [
  { footKey: "footL" as FootKey, letter: "L" },
  { footKey: "footR" as FootKey, letter: "R" },
];

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

function setTraceColor(sequence: Sequence, footKey: FootKey, color: string) {
  store.setTraceColor(sequence, footKey, color);
  editor?.draw();
}

function swatchTextColor(color: string): string {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return "white";
  const channels = [0, 2, 4].map((offset) => parseInt(match[1]!.slice(offset, offset + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.35 ? "black" : "white";
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

function parseTimingValue(draft: string): number | null {
  const text = draft.trim();
  if (!text) return null;
  if (timingKind.value === "beats") {
    const beats = Number(text);
    return Number.isFinite(beats) && beats > 0 ? beats : null;
  }
  const matches = text.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!matches) return null;
  const seconds = Number(matches[2]);
  if (seconds >= 60) return null;
  const minutes = Number(matches[1]);
  const millis = matches[3] ? Number(matches[3].padEnd(3, "0")) : 0;
  return minutes * 60 + seconds + millis / 1000;
}

function validateTimingValue(draft: string): "format" | "bounds" | null {
  const value = parseTimingValue(draft);
  if (value === null) return "format";
  if (timingKind.value === "time" && timingPreviousValue.value !== null && value < timingPreviousValue.value) {
    return "bounds";
  }
  return null;
}

const timingTimeInput = ref<{ $el?: HTMLInputElement | null } | null>(null);
const timingBeatsInput = ref<{ $el?: HTMLElement | null } | null>(null);

async function focusTimingValueInput() {
  await nextTick();
  if (timingKind.value === "time") {
    timingTimeInput.value?.$el?.focus();
    return;
  }
  timingBeatsInput.value?.$el?.querySelector<HTMLInputElement>("input")?.focus();
}

function openTimingKeyframeChange(keyframe: TimingKeyframe, isProvisional: boolean) {
  timingTarget.value = keyframe;
  timingIsProvisional.value = isProvisional;
  timingOriginalKind.value = keyframe.kind;
  timingOriginalValue.value = keyframe.value;
  timingKind.value = keyframe.kind;
  timingValueDraft.value = keyframe.kind === "time" ? formatTimingLabel(keyframe.value) : String(keyframe.value);
  timingValueError.value = null;
  timingKeyframeOpen.value = true;
  focusTimingValueInput();
}

function getBpm(): number {
  return store.getDiagram().bpm || 120;
}

function onTimingKindChange(kind: TimingKind) {
  if (kind === timingKind.value) return;
  const parsed = parseTimingValue(timingValueDraft.value); // in the previous kind
  timingKind.value = kind;
  if (parsed === null) {
    const hasOriginal = timingOriginalKind.value !== null && timingOriginalValue.value !== null;
    if (hasOriginal && timingOriginalKind.value !== kind) {
      const original = timingOriginalValue.value!;
      if (kind === "time") {
        timingValueDraft.value = formatTimingValue((original * 60) / getBpm());
      } else {
        timingValueDraft.value = String(Math.round((original * getBpm()) / 60));
      }
    } else if (!hasOriginal) {
      timingValueDraft.value = kind === "time" ? formatTimingValue(60) : "4";
    }
    return;
  }
  if (kind === "time") {
    timingValueDraft.value = formatTimingValue((parsed * 60) / getBpm());
  } else {
    timingValueDraft.value = String(Math.round((parsed * getBpm()) / 60));
  }
}

const timingKindModel = computed<TimingKind>({
  get: () => timingKind.value,
  set: (kind) => onTimingKindChange(kind),
});

// The InputNumber writes through to the draft so validation and OK commit stay unchanged.
const timingBeatsModel = computed<number | null>({
  get: () => {
    const beats = Number(timingValueDraft.value);
    if (Number.isFinite(beats) && beats > 0) return beats;
    return timingOriginalKind.value === "beats" && timingOriginalValue.value !== null && timingOriginalValue.value > 0
      ? timingOriginalValue.value
      : 1;
  },
  set: (value) => {
    if (value === null) return;
    timingValueDraft.value = String(Math.max(1, Math.round(value)));
  },
});

function formatTimingStepValue(value: number, decimals: number): string {
  if (decimals <= 0 || Number.isInteger(value)) return formatTimingValue(value);
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(decimals).padStart(decimals + 3, "0")}`;
}

function stepTimingValue(direction: 1 | -1) {
  const draft = timingValueDraft.value.trim();
  const parsed = parseTimingValue(draft);
  const base =
    parsed ??
    (timingOriginalKind.value === "time" && timingOriginalValue.value !== null ? timingOriginalValue.value : 0);
  const lower = Math.max(timingPreviousValue.value ?? 0, 0);
  const candidate = direction === 1 ? base + 1 : Math.max(base - 1, lower);
  const decimals = draft.match(/\.(\d{1,3})$/); // keep the entered decimal digits
  timingValueDraft.value = formatTimingStepValue(candidate, decimals ? decimals[1]!.length : 0);
}

function closeTimingKeyframe() {
  timingKeyframeOpen.value = false;
  timingTarget.value = null;
}

function commitTimingKeyframe() {
  const target = timingTarget.value;
  if (!target) {
    closeTimingKeyframe();
    return;
  }
  const error = validateTimingValue(timingValueDraft.value);
  if (error !== null) {
    timingValueError.value = error;
    return;
  }
  const value = parseTimingValue(timingValueDraft.value) as number;
  if (timingIsProvisional.value) {
    const replacement = new TimingKeyframe(target.pathCoordinate, timingKind.value, value);
    const sequence = editor?.commitProvisionalTimingKeyframe(target, replacement);
    if (sequence) store.saveToStorage();
  } else {
    target.kind = timingKind.value;
    target.value = value;
    store.saveToStorage();
  }
  editor?.draw();
  closeTimingKeyframe();
}

const clearOpen = ref(false);

watch([timingValueDraft, timingKind, timingPreviousValue], () => {
  timingValueError.value = validateTimingValue(timingValueDraft.value);
});

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
  const editorInstance = new Editor(canvasRef.value, visibleSequences.value);
  editor = editorInstance;

  editorInstance.onElementChangeRequest = (element) => {
    elementToChange.value = element;
    isProvisionalTarget.value = editorInstance.isProvisional(element);
    oldKind.value = isProvisionalTarget.value ? null : kindOfType(element.type);
    oldVariant.value = isProvisionalTarget.value ? null : parseVariantFlags(element.type);
    validVariant.value = null;
    if (element instanceof TwoFeetTurn || element instanceof OneFootTurn) {
      const elementSequence = editorInstance.getSequenceOfElement(element);
      if (elementSequence) validVariant.value = checkTurnVariantValidity(elementSequence, element);
    }
    elementChangeBranch.value = null;
    glidePath.value = [];
    strokePath.value = [];
    turnPath.value = [];
    twoFeetPath.value = [];
    clearPendingChoice();
    if (!isProvisionalTarget.value) openAtExistingVariant();
    elementChangeOpen.value = true;
  };
  editorInstance.onSequenceChange = () => store.saveToStorage();
  editorInstance.onTimingKeyframeChangeRequest = (keyframe, isProvisional, previous) => {
    timingPreviousValue.value = previous ? previous.value : null;
    openTimingKeyframeChange(keyframe, isProvisional);
  };
});

let previousVisibleSequences: Sequence[] = [];
watch(visibleSequences, (list) => {
  const sameMembers =
    list.length === previousVisibleSequences.length && list.every((s, i) => s === previousVisibleSequences[i]);
  previousVisibleSequences = list;
  if (!sameMembers && editor) editor.setSequences(list);
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

function clearPendingChoice() {
  pendingReplacement.value = null;
  shortNameDraft.value = "";
}

const currentStepFinal = computed(() => {
  switch (elementChangeBranch.value) {
    case "glide":
      return glideStepFinal.value;
    case "stroke":
      return strokeStepFinal.value;
    case "turn":
      return turnStepFinal.value;
    case "twoFeetTurn":
      return twoFeetTurnStepFinal.value;
    default:
      return false;
  }
});

function openAtExistingVariant() {
  const flags = oldVariant.value;
  const branch = oldKind.value;
  const element = elementToChange.value;
  if (!flags || !branch || !element || !element.type) {
    elementChangeBranch.value = null;
    return;
  }
  elementChangeBranch.value = branch;
  if (branch === "glide") {
    glidePath.value = flags.twoFoot
      ? ["TwoFoot", flags.direction ?? "Forward"]
      : [flags.side ?? "Left", flags.direction ?? "Forward", flags.edge ?? "Neither"];
  } else if (branch === "stroke") {
    strokePath.value = [
      flags.side ?? "Left",
      flags.direction ?? "Forward",
      flags.edge ?? "Neither",
      flags.stroke ?? "Normal",
    ];
  } else if (branch === "turn") {
    turnPath.value = [
      flags.group ?? "ThreeTurn",
      flags.side ?? "Left",
      flags.direction ?? "Forward",
      flags.edge ?? "Inside",
    ];
    if (flags.group === "Twizzle") turnPath.value.push(flags.turns ?? "1");
  } else {
    twoFeetPath.value = [
      flags.group ?? "Mohawk",
      flags.side ?? "Left",
      flags.direction ?? "Forward",
      flags.openness ?? "Open",
    ];
  }
  onFinalChoice(element.type);
}

function onClearConfirmed() {
  store.clear();
  closeClear();
}

function closeClear() {
  clearOpen.value = false;
}

function chooseElementBranch(branch: ElementKind) {
  elementChangeBranch.value = branch;
  glidePath.value = [];
  strokePath.value = [];
  turnPath.value = [];
  twoFeetPath.value = [];
  clearPendingChoice();
}

function onFinalChoice(type: string) {
  const target = elementToChange.value;
  if (!target) return;
  const candidate = changeElementType(type, { type, start: target.start, end: target.end });
  pendingReplacement.value = candidate;
  shortNameDraft.value =
    !isProvisionalTarget.value && type === target.type ? target.shortName : candidate.defaultShortName;
}

function onGlideChange(value: string) {
  const next = [...glidePath.value, value];
  glidePath.value = next;
  if (next.length >= (next[0] === "TwoFoot" ? 2 : 3)) {
    const [side, direction, edge] = next;
    onFinalChoice(
      side === "TwoFoot" ? `Both${direction}Glide` : `${side}${direction}${edge === "Neither" ? "" : edge}Glide`,
    );
  }
}

function onStrokeChange(value: string) {
  const next = [...strokePath.value, value];
  strokePath.value = next;
  if (next.length >= strokeLevelOptions.length) {
    const [side, direction, edge, crossed] = next;
    onFinalChoice(`${side}${crossed}${direction}${edge === "Neither" ? "" : edge}Glide`);
  }
}

function onTurnChange(value: string) {
  const next = [...turnPath.value, value];
  turnPath.value = next;
  if (next.length >= (turnStepCounts[next[0] ?? ""] ?? 1)) {
    if (next[0] === "Twizzle") {
      const [, side, direction, edge, turns] = next;
      onFinalChoice(`${side}${direction}${edge}Twizzle${turns}`);
    } else {
      const [group, side, direction, edge] = next;
      onFinalChoice(`${side}${direction}${edge}${group}`);
    }
  }
}

function onTwoFeetTurnChange(value: string) {
  const next = [...twoFeetPath.value, value];
  twoFeetPath.value = next;
  if (next.length >= 4) {
    const [group, side, direction, openness] = next;
    onFinalChoice(`${side}${direction}${openness}${group}`);
  }
}

function commitElementChange() {
  const replacement = pendingReplacement.value;
  if (!replacement || !elementToChange.value) {
    closeElementChange();
    return;
  }
  replacement.shortName = shortNameDraft.value.trim();
  const target = elementToChange.value;
  if (isProvisionalTarget.value) {
    const sequence = editor?.commitProvisionalElement(target, replacement);
    if (sequence) store.saveToStorage();
  } else {
    const sequence = editor?.replaceElementOf(target, replacement);
    if (sequence) {
      elementToChange.value = replacement;
      store.saveToStorage();
    }
  }
  editor?.draw();
  closeElementChange();
}

function startElementChange() {
  elementChangeBranch.value = null;
  glidePath.value = [];
  strokePath.value = [];
  turnPath.value = [];
  twoFeetPath.value = [];
  clearPendingChoice();
}

function previousElementChangeStep() {
  if (elementChangeBranch.value === "glide" && glidePath.value.length > 0) {
    glidePath.value = glidePath.value.slice(0, -1);
    clearPendingChoice();
    return;
  }
  if (elementChangeBranch.value === "stroke" && strokePath.value.length > 0) {
    strokePath.value = strokePath.value.slice(0, -1);
    clearPendingChoice();
    return;
  }
  if (elementChangeBranch.value === "turn" && turnPath.value.length > 0) {
    turnPath.value = turnPath.value.slice(0, -1);
    clearPendingChoice();
    return;
  }
  if (elementChangeBranch.value === "twoFeetTurn" && twoFeetPath.value.length > 0) {
    twoFeetPath.value = twoFeetPath.value.slice(0, -1);
    clearPendingChoice();
    return;
  }
  elementChangeBranch.value = null;
}

function closeElementChange() {
  elementChangeOpen.value = false;
  clearPendingChoice();
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
            <label class="editor-view__mode-label">Diagram name</label>
            <InputText v-model="diagramName" class="w-full" />
            <label class="editor-view__mode-label" for="diagram-bpm">BPM</label>
            <InputNumber id="diagram-bpm" v-model="diagramBpm" :min="1" :step="1" :use-grouping="false" fluid />
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
                <span class="editor-view__swatches">
                  <span
                    v-for="swatch in footSwatches"
                    :key="swatch.footKey"
                    class="editor-view__swatch-wrapper"
                    @click.stop
                  >
                    <ColorPicker
                      class="editor-view__swatch"
                      :aria-label="`${sequenceInfos.get(option)?.name ?? 'Sequence'} foot trace color ${swatch.letter}`"
                      :model-value="sequenceInfos.get(option)?.[swatch.footKey]"
                      @update:model-value="(value) => setTraceColor(option, swatch.footKey, `#${value}`)"
                    />
                    <span
                      class="editor-view__swatch-letter"
                      :style="{ color: swatchTextColor(sequenceInfos.get(option)?.[swatch.footKey] ?? '#ffffff') }"
                      >{{ swatch.letter }}</span
                    >
                  </span>
                </span>
                <Inplace
                  class="editor-view__sequence-name"
                  :active="renamingTarget === option"
                  @click.stop
                  @open="startRename(option)"
                  @keyup.enter="commitRename"
                  @keyup.esc="cancelRename"
                >
                  <template #display>{{ sequenceInfos.get(option)?.name }}</template>
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
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => chooseElementBranch(event.value)"
        >
          <template #option="{ option }">
            <span :class="{ 'editor-view__option-old': option.value === oldKind }">
              {{ option.label }}
            </span>
          </template>
        </Listbox>
      </template>

      <template v-else>
        <div class="editor-view__element-kind">
          <Tag v-for="label in chosenLabels" :key="label" :value="label" />
        </div>

        <Listbox
          v-if="elementChangeBranch === 'glide' && !glideStepFinal"
          :model-value="null"
          :options="currentGlideOptions"
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => onGlideChange(event.value)"
        >
          <template #option="{ option }">
            <span :class="{ 'editor-view__option-old': oldValueAt('glide', glidePath.length, option.value) }">
              {{ option.label }}
            </span>
          </template>
        </Listbox>

        <Listbox
          v-else-if="elementChangeBranch === 'stroke' && !strokeStepFinal"
          :model-value="null"
          :options="currentStrokeOptions"
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => onStrokeChange(event.value)"
        >
          <template #option="{ option }">
            <span :class="{ 'editor-view__option-old': oldValueAt('stroke', strokePath.length, option.value) }">
              {{ option.label }}
            </span>
          </template>
        </Listbox>

        <Listbox
          v-else-if="elementChangeBranch === 'turn' && !turnStepFinal"
          :model-value="null"
          :options="currentTurnOptions"
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => onTurnChange(event.value)"
        >
          <template #option="{ option }">
            <span class="editor-view__option-row">
              <span :class="{ 'editor-view__option-old': oldValueAt('turn', turnPath.length, option.value) }">
                {{ option.label }}
              </span>
              <i
                v-if="validFlagAt('turn', turnPath.length, option.value)"
                class="pi pi-check-circle editor-view__valid-check"
                aria-label="Valid variant flag"
              ></i>
            </span>
          </template>
        </Listbox>

        <Listbox
          v-else-if="elementChangeBranch === 'twoFeetTurn' && !twoFeetTurnStepFinal"
          :model-value="null"
          :options="currentTwoFeetTurnOptions"
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => onTwoFeetTurnChange(event.value)"
        >
          <template #option="{ option }">
            <span class="editor-view__option-row">
              <span :class="{ 'editor-view__option-old': oldValueAt('twoFeetTurn', twoFeetPath.length, option.value) }">
                {{ option.label }}
              </span>
              <i
                v-if="validFlagAt('twoFeetTurn', twoFeetPath.length, option.value)"
                class="pi pi-check-circle editor-view__valid-check"
                aria-label="Valid variant flag"
              ></i>
            </span>
          </template>
        </Listbox>

        <div v-else class="editor-view__short-name">
          <label class="editor-view__mode-label" for="element-short-name">Short name</label>
          <InputText
            id="element-short-name"
            v-model="shortNameDraft"
            class="w-full"
            @keyup.enter="commitElementChange"
          />
        </div>
      </template>

      <template #footer>
        <Button
          v-if="currentStepFinal"
          label="Start"
          severity="secondary"
          icon="pi pi-home"
          @click="startElementChange"
        />
        <Button
          v-if="elementChangeBranch"
          label="Previous"
          severity="secondary"
          icon="pi pi-arrow-left"
          @click="previousElementChangeStep"
        />
        <Button v-if="currentStepFinal" label="OK" icon="pi pi-check" @click="commitElementChange" />
        <Button v-else label="Close" severity="secondary" icon="pi pi-times" @click="closeElementChange" />
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

    <Dialog
      v-model:visible="timingKeyframeOpen"
      header="Timing keyframe"
      modal
      class="editor-view__timing-dialog"
      @hide="closeTimingKeyframe"
    >
      <SelectButton
        v-model="timingKindModel"
        :options="timingTypeOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
      />
      <p v-if="timingKind === 'beats'" class="editor-view__timing-caption">
        Number of beats from the previous timing keyframe.
      </p>
      <div class="editor-view__timing-value">
        <label class="editor-view__mode-label" for="timing-value">{{
          timingKind === "time" ? "Time (min:sec.decimals)" : "Beats"
        }}</label>
        <InputGroup v-if="timingKind === 'time'">
          <InputText
            id="timing-value"
            ref="timingTimeInput"
            v-model="timingValueDraft"
            class="w-full"
            :invalid="timingValueInvalid"
            autofocus
            @keyup.enter="commitTimingKeyframe"
          />
          <InputGroupAddon>
            <div class="editor-view__timing-arrows">
              <Button
                icon="pi pi-chevron-up"
                severity="secondary"
                text
                rounded
                size="small"
                aria-label="Increase by one second"
                @click="stepTimingValue(1)"
              />
              <Button
                icon="pi pi-chevron-down"
                severity="secondary"
                text
                rounded
                size="small"
                aria-label="Decrease by one second"
                @click="stepTimingValue(-1)"
              />
            </div>
          </InputGroupAddon>
        </InputGroup>
        <InputNumber
          v-else
          id="timing-value"
          ref="timingBeatsInput"
          v-model="timingBeatsModel"
          class="w-full"
          :min="1"
          :step="1"
          :max-fraction-digits="0"
          :use-grouping="false"
          show-buttons
          button-layout="stacked"
          fluid
          :pt="{ pcInputText: { root: { autofocus: true } } }"
          @keyup.enter="commitTimingKeyframe"
        />
        <small v-if="timingValueInvalid" class="editor-view__timing-error">
          {{
            timingValueError === "bounds"
              ? "The time must not be before the previous timing keyframe."
              : timingKind === "time"
                ? "Use min:sec or min:sec.decimals with seconds below 60, for example 1:24.5."
                : "Enter a number of beats."
          }}
        </small>
      </div>
      <template #footer>
        <Button label="OK" icon="pi pi-check" @click="commitTimingKeyframe" />
        <Button label="Close" severity="secondary" icon="pi pi-times" @click="closeTimingKeyframe" />
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
  min-height: 100%;
}

.editor-view__panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
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

.editor-view__sequence-name :deep(.p-inplace-content) {
  width: 100%;
  min-width: 0;
}

.editor-view__sequence-name :deep(.p-inplace-content .p-inputtext) {
  width: 100%;
  min-width: 0;
}

.editor-view__swatches {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-inline: 0.25rem;
}

.editor-view__swatch-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.editor-view__swatch {
  display: inline-flex;
}

.editor-view__swatch :deep(input.p-colorpicker-preview) {
  display: block;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  font-size: 0;
  cursor: pointer;
}

.editor-view__swatch-letter {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1;
  pointer-events: none;
  user-select: none;
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
  background: white;
}

.editor-view__floating {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 5;
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

.editor-view__short-name {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.25rem;
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

.editor-view__element-dialog .editor-view__option-old {
  color: var(--p-primary-color);
  font-weight: 600;
}

.editor-view__element-dialog .editor-view__option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 0;
}

.editor-view__element-dialog .editor-view__valid-check {
  flex-shrink: 0;
  color: #2e7d32;
}

.editor-view__timing-dialog {
  width: 320px;
  max-width: 90vw;
  min-width: 0;
}

.editor-view__timing-dialog .p-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.editor-view__timing-caption {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.editor-view__timing-value {
  display: flex;
  flex-direction: column;
}

.editor-view__timing-error {
  margin-top: 0.25rem;
  color: var(--p-form-field-invalid-hover-border-color);
}

.editor-view__timing-arrows {
  display: flex;
  flex-direction: column;
  margin-block: -0.25rem;
}
</style>
