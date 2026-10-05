<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import Button from "openvue/button";
import Tag from "openvue/tag";
import Toast from "openvue/toast";
import { useToast } from "openvue/usetoast";
import Select from "openvue/select";
import SelectButton from "openvue/selectbutton";
import Tabs from "openvue/tabs";
import Tab from "openvue/tab";
import TabList from "openvue/tablist";
import Dialog from "openvue/dialog";
import InputText from "openvue/inputtext";
import InputNumber from "openvue/inputnumber";
import Textarea from "openvue/textarea";
import InputGroup from "openvue/inputgroup";
import InputGroupAddon from "openvue/inputgroupaddon";
import Listbox from "openvue/listbox";
import ColorPicker from "openvue/colorpicker";
import ToggleSwitch from "openvue/toggleswitch";
import Splitter from "openvue/splitter";
import SplitterPanel from "openvue/splitterpanel";
import TimeSyncPane from "@/components/TimeSyncPane.vue";
import DiagramLegend from "@/components/DiagramLegend.vue";
import TrackingButton from "@/components/TrackingButton.vue";
import DiagramSidebar, { type HelpItem } from "@/components/DiagramSidebar.vue";
import { Editor, formatTimingLabel, type EditMode, type PathCreationState } from "@/engine/sequenceEditor/editor";
import { TimingKeyframe, type TimingKind } from "@/engine/keyframe";
import { DEFAULT_ANNOTATION_COLOR, type Annotation } from "@/engine/annotation";
import type { Sequence } from "@/engine/sequence";
import {
  changeElementType,
  isJumpType,
  isSpinType,
  jumpTypeChoices,
  parseJumpType,
  parseSpinType,
} from "@/engine/element/turnTypes";
import { getJumpBaseConfig } from "@/engine/element/jump";
import type { Jump } from "@/engine/element/jump";
import { Spin, type SpinType } from "@/engine/element/spin";
import { parseVariantFlags, type VariantFlags } from "@/engine/element/variantFlags";
import {
  checkOneFootVariantValidity,
  checkTurnVariantValidity,
  type OneFootVariantValidity,
  type TurnVariantValidity,
} from "@/engine/sequenceEditor/variantValidation";
import { OneFootTurn } from "@/engine/element/oneFootTurn";
import { TwoFeetTurn } from "@/engine/element/twoFeetTurn";
import type { Element } from "@/engine/element/element";
import { earliestTimeKeyframeSeconds, fullTimeExtentSeconds } from "@/engine/diagram";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";
import { useAppearanceStore } from "@/stores/appearance";
import { useInputModeStore } from "@/stores/inputMode";
import { storeToRefs } from "pinia";
import UndoRedoButtons from "@/components/UndoRedoButtons.vue";
import { useUndoRedoKeys } from "@/composables/useUndoRedoKeys";
import { useMediaQuery } from "@/composables/useMediaQuery";
import { useVideoTimestamp } from "@/composables/useVideoTimestamp";
import { usePlaybackKeyToggle } from "@/composables/usePlaybackKeyToggle";
import { usePlaybackLoop } from "@/composables/usePlaybackLoop";
import { useEditorModeKeys } from "@/composables/useEditorModeKeys";
import { useTimeCursorStepping } from "@/composables/useTimeCursorStepping";
import { useTimeCursorKeys } from "@/composables/useTimeCursorKeys";
import { useTooltipTouchGuard } from "@/composables/useTooltipTouchGuard";
import { usePlaybackSpeed } from "@/composables/usePlaybackSpeed";
import { textColorFor } from "@/utils/contrast";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const canvasRef = ref<HTMLCanvasElement | null>(null);

const editModeOptions = computed(() => [
  { label: t("editor.modes.view"), value: "view", icon: "pi pi-eye", key: "V" },
  { label: t("editor.modes.path"), value: "path", icon: "pi pi-signature", key: "P" },
  { label: t("editor.modes.elements"), value: "elements", icon: "pi pi-objects-column", key: "E" },
  { label: t("editor.modes.timing"), value: "timing", icon: "pi pi-clock", key: "T" },
  { label: t("editor.modes.annotations"), value: "annotations", icon: "pi pi-tag", key: "A" },
]);
const editMode = ref<EditMode>("view");

const isMobile = useMediaQuery("(max-width: 767.98px)");
const drawerOpen = ref(false);

function onVideoError() {
  if (videoSet.value) videoStatus.value = "invalid";
}

function onVideoLoad() {
  videoStatus.value = "valid";
  applyPlaybackSpeed();
  const earliest = earliestTimeKeyframeSeconds(store.getDiagram());
  if (earliest !== null) setTimestamp(earliest);
}

const elementChangeOpen = ref(false);
const elementToChange = shallowRef<Element | null>(null);
const elementChangeBranch = ref<"glide" | "stroke" | "turn" | "twoFeetTurn" | "jump" | "spin" | null>(null);
const isProvisionalTarget = ref(false);
const oldVariant = ref<VariantFlags | null>(null);
const validVariant = ref<TurnVariantValidity | null>(null);
const validOneFootVariant = ref<OneFootVariantValidity | null>(null);
const oldKind = ref<"glide" | "stroke" | "turn" | "twoFeetTurn" | "jump" | "spin" | null>(null);
const pendingReplacement = shallowRef<Element | null>(null);
const shortNameDraft = ref("");
const glidePath = ref<string[]>([]);
const strokePath = ref<string[]>([]);
const turnPath = ref<string[]>([]);
const twoFeetPath = ref<string[]>([]);
const jumpPath = ref<string[]>([]);
const spinPath = ref<string[]>([]);
const defaultSpinRevolutions = 3;
const spinRevolutionsDraft = ref<number | null>(defaultSpinRevolutions);

const elementKindGroupOptions = computed(() => [
  { label: t("editor.kinds.glide"), value: "glide" },
  { label: t("editor.kinds.stroke"), value: "stroke" },
  { label: t("editor.kinds.oneFootTurn"), value: "turn" },
  { label: t("editor.kinds.twoFeetTurn"), value: "twoFeetTurn" },
  { label: t("editor.kinds.jump"), value: "jump" },
  { label: t("editor.kinds.spin"), value: "spin" },
]);

const glideLevelOptions = computed<{ label: string; value: string }[][]>(() => [
  [
    { label: t("editor.common.left"), value: "Left" },
    { label: t("editor.common.right"), value: "Right" },
    { label: t("editor.common.twoFeet"), value: "TwoFoot" },
  ],
  [
    { label: t("editor.common.forward"), value: "Forward" },
    { label: t("editor.common.backward"), value: "Backward" },
  ],
  [
    { label: t("editor.common.inside"), value: "Inside" },
    { label: t("editor.common.outside"), value: "Outside" },
    { label: t("editor.common.neither"), value: "Neither" },
  ],
]);

const glideTwoFeetOptions = computed<{ label: string; value: string }[]>(() => [
  { label: t("editor.common.forward"), value: "Forward" },
  { label: t("editor.common.backward"), value: "Backward" },
  { label: t("editor.glide.spreadEagle"), value: "SpreadEagle" },
  { label: t("editor.glide.inaBauer"), value: "InaBauer" },
]);

const glidePoseFrontFootOptions = computed(() => [
  { label: t("editor.glide.leftFront"), value: "Left" },
  { label: t("editor.glide.rightFront"), value: "Right" },
]);

const strokeLevelOptions = computed<{ label: string; value: string }[][]>(() => [
  [
    { label: t("editor.common.left"), value: "Left" },
    { label: t("editor.common.right"), value: "Right" },
  ],
  [
    { label: t("editor.common.forward"), value: "Forward" },
    { label: t("editor.common.backward"), value: "Backward" },
  ],
  [
    { label: t("editor.common.inside"), value: "Inside" },
    { label: t("editor.common.outside"), value: "Outside" },
    { label: t("editor.common.neither"), value: "Neither" },
  ],
  [
    { label: t("editor.stroke.normal"), value: "Normal" },
    { label: t("editor.stroke.crossed"), value: "Crossed" },
    { label: t("editor.stroke.crossedBack"), value: "CrossedBack" },
  ],
]);

const turnGroupOptions = computed(() => [
  { label: t("editor.turns.threeTurn"), value: "ThreeTurn" },
  { label: t("editor.turns.bracket"), value: "Bracket" },
  { label: t("editor.turns.rocker"), value: "Rocker" },
  { label: t("editor.turns.counter"), value: "Counter" },
  { label: t("editor.turns.loop"), value: "Loop" },
  { label: t("editor.turns.twizzle"), value: "Twizzle" },
]);

const turnSideLevelOptions = computed(() => [
  { label: t("editor.common.left"), value: "Left" },
  { label: t("editor.common.right"), value: "Right" },
]);

const turnDirectionLevelOptions = computed(() => [
  { label: t("editor.common.forward"), value: "Forward" },
  { label: t("editor.common.backward"), value: "Backward" },
]);

const turnEdgeLevelOptions = computed(() => [
  { label: t("editor.common.inside"), value: "Inside" },
  { label: t("editor.common.outside"), value: "Outside" },
]);

const twoFeetTurnGroupOptions = computed(() => [
  { label: t("editor.twoFeetTurns.mohawk"), value: "Mohawk" },
  { label: t("editor.twoFeetTurns.choctaw"), value: "Choctaw" },
]);

const twoFeetTurnOpennessLevelOptions = computed(() => [
  { label: t("editor.twoFeetTurns.open"), value: "Open" },
  { label: t("editor.twoFeetTurns.closed"), value: "Closed" },
]);

const twoFeetTurnLevelOptionsByGroup = computed<{ [group: string]: { label: string; value: string }[][] }>(() => ({
  Mohawk: [turnSideLevelOptions.value, turnDirectionLevelOptions.value, twoFeetTurnOpennessLevelOptions.value],
  Choctaw: [turnSideLevelOptions.value, turnDirectionLevelOptions.value, twoFeetTurnOpennessLevelOptions.value],
}));

const twoFeetTurnStepCounts: { [group: string]: number } = {
  Mohawk: 4,
  Choctaw: 4,
};

// The half-turn label shows "½" for x.5 values; the unit pluralizes with the i18n catalog.
function twizzleTurnLabel(value: string): string {
  const turns = Number(value);
  const display = value.endsWith(".5") ? `${value.slice(0, -2)}½` : value;
  return `${display} ${t("editor.turnUnit", turns === 0.5 || turns === 1 ? 1 : 2)}`;
}

const twizzleTurnsLevelOptions = computed(() =>
  ["0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "5.5"].map((value) => ({
    label: twizzleTurnLabel(value),
    value,
  })),
);

const turnLevelOptionsByGroup = computed<{ [group: string]: { label: string; value: string }[][] }>(() => ({
  ThreeTurn: [turnSideLevelOptions.value, turnDirectionLevelOptions.value, turnEdgeLevelOptions.value],
  Bracket: [turnSideLevelOptions.value, turnDirectionLevelOptions.value, turnEdgeLevelOptions.value],
  Rocker: [turnSideLevelOptions.value, turnDirectionLevelOptions.value, turnEdgeLevelOptions.value],
  Counter: [turnSideLevelOptions.value, turnDirectionLevelOptions.value, turnEdgeLevelOptions.value],
  Loop: [turnSideLevelOptions.value, turnDirectionLevelOptions.value, turnEdgeLevelOptions.value],
  Twizzle: [
    turnSideLevelOptions.value,
    turnDirectionLevelOptions.value,
    turnEdgeLevelOptions.value,
    twizzleTurnsLevelOptions.value,
  ],
}));

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
  if (turnPath.value.length === 0) return turnGroupOptions.value;
  return turnLevelOptionsByGroup.value[turnGroup.value]?.[turnPath.value.length - 1] ?? [];
});

const twoFeetTurnGroup = computed(() => twoFeetPath.value[0] ?? "");

const twoFeetTurnStepFinal = computed(
  () => twoFeetPath.value.length >= (twoFeetTurnStepCounts[twoFeetTurnGroup.value] ?? 1),
);

const currentTwoFeetTurnOptions = computed(() => {
  if (twoFeetTurnStepFinal.value) return [];
  if (twoFeetPath.value.length === 0) return twoFeetTurnGroupOptions.value;
  return twoFeetTurnLevelOptionsByGroup.value[twoFeetTurnGroup.value]?.[twoFeetPath.value.length - 1] ?? [];
});

const glideSideTwoFoot = computed(() => glidePath.value[0] === "TwoFoot");
const glidePose = computed(() => (glideSideTwoFoot.value ? glidePath.value[1] : undefined));
const glidePoseStep = computed(() => glidePose.value === "SpreadEagle" || glidePose.value === "InaBauer");
const glideStepFinal = computed(
  () => glidePath.value.length >= (glidePoseStep.value ? 3 : glideSideTwoFoot.value ? 2 : 3),
);

const currentGlideOptions = computed(() => {
  if (glideStepFinal.value) return [];
  if (glidePath.value.length === 1 && glideSideTwoFoot.value) return glideTwoFeetOptions.value;
  if (glidePath.value.length === 2 && glidePoseStep.value) return glidePoseFrontFootOptions.value;
  return glideLevelOptions.value[glidePath.value.length] ?? [];
});

const strokeStepFinal = computed(() => strokePath.value.length >= strokeLevelOptions.value.length);

const currentStrokeOptions = computed(
  () => (strokeStepFinal.value ? [] : strokeLevelOptions.value[strokePath.value.length]) ?? [],
);

type ElementKind = "glide" | "stroke" | "turn" | "twoFeetTurn" | "jump" | "spin";

function kindOfType(type: string): ElementKind {
  if (isJumpType(type)) return "jump";
  if (isSpinType(type)) return "spin";
  const flags = parseVariantFlags(type);
  if (flags.stroke) return "stroke";
  if (flags.openness) return "twoFeetTurn";
  if (flags.group) return "turn";
  return "glide";
}

function oldValueAt(branch: ElementKind, level: number, value: string): boolean {
  if (branch === "jump") {
    const element = elementToChange.value;
    const parsed = parseJumpType(element?.type ?? "");
    const leftHanded = element && isJumpType(element.type) ? (element as Jump).leftHanded : false;
    if (level === 0) return parsed !== undefined && value === (leftHanded ? "Left" : "Right");
    if (level === 1) return parsed !== undefined && parsed.jump === value;
    if (level === 2) return parsed !== undefined && String(parsed.revolutions) === value;
    return false;
  }
  if (branch === "spin") {
    const element = elementToChange.value;
    const parsed = parseSpinType(element?.type ?? "");
    const leftHanded = element instanceof Spin && element.leftHanded;
    if (level === 0) return parsed !== undefined && value === (leftHanded ? "Left" : "Right");
    if (level === 1) return parsed !== undefined && value === (parsed.leftFoot ? "LeftFoot" : "RightFoot");
    if (level === 2) return parsed !== undefined && value === (parsed.inside ? "Inside" : "Outside");
    if (level === 3) {
      const spinType = element instanceof Spin ? element.spinType : undefined;
      return parsed !== undefined && spinType !== undefined && value === spinType;
    }
    return false;
  }
  const flags = oldVariant.value;
  if (!flags) return false;
  if (branch === "glide") {
    if (flags.pose) {
      if (level === 0) return value === "TwoFoot";
      if (level === 1) return value === flags.pose;
      if (level === 2) return value === flags.frontFoot;
      return false;
    }
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

// Valid flags from the geometry at the element start; the edge check only applies to one-foot turns.
function validFlagAt(branch: ElementKind, level: number, value: string): boolean {
  const v = validVariant.value;
  if (!v) return false;
  if (level === 1) return v.left !== null && value === (v.left ? "Left" : "Right");
  if (level === 2) return v.forward !== null && value === (v.forward ? "Forward" : "Backward");
  if (branch === "turn" && level === 3) return v.inside !== null && value === (v.inside ? "Inside" : "Outside");
  return false;
}

// Valid direction and edge of a one-foot glide or stroke from the geometry; they
// become known after the foot is selected at the first step, so the same check
// flags apply to both the glide and the stroke levels.
function oneFootValidAt(level: number, value: string): boolean {
  const v = validOneFootVariant.value;
  if (!v) return false;
  if (level === 1) return v.forward !== null && value === (v.forward ? "Forward" : "Backward");
  if (level === 2) return v.inside !== null && value === (v.inside ? "Inside" : "Outside");
  return false;
}

// Valid jumps from the geometry; the take-off foot and direction are gated by handedness-mirrored take-off foot.
function jumpTypeValid(name: string): boolean {
  const v = validVariant.value;
  if (!v) return false;
  const config = getJumpBaseConfig(name);
  if (!config) return false;
  if (v.left === null || v.forward === null) return false;
  const leftHanded = jumpPath.value[0] === "Left";
  const mirroredFoot = leftHanded ? (config.takeOffFoot === "footL" ? "footR" : "footL") : config.takeOffFoot;
  if (mirroredFoot !== (v.left ? "footL" : "footR")) return false;
  if (config.takeOffForward !== v.forward) return false;
  if (v.inside !== null && config.takeOffEdge !== (v.inside ? "inside" : "outside")) return false;
  return true;
}

// Auto is offered on any step that shows at least one compatible variant.
const autoSelectAvailable = computed(() => {
  if (elementChangeBranch.value === "turn") {
    const level = turnPath.value.length;
    return !turnStepFinal.value && currentTurnOptions.value.some((choice) => validFlagAt("turn", level, choice.value));
  }
  if (elementChangeBranch.value === "twoFeetTurn") {
    const level = twoFeetPath.value.length;
    return (
      !twoFeetTurnStepFinal.value &&
      currentTwoFeetTurnOptions.value.some((choice) => validFlagAt("twoFeetTurn", level, choice.value))
    );
  }
  if (elementChangeBranch.value === "jump") {
    return jumpPath.value.length === 1 && currentJumpOptions.value.some((choice) => jumpTypeValid(choice.value));
  }
  if (elementChangeBranch.value === "glide") {
    const level = glidePath.value.length;
    return !glideStepFinal.value && currentGlideOptions.value.some((choice) => oneFootValidAt(level, choice.value));
  }
  if (elementChangeBranch.value === "stroke") {
    const level = strokePath.value.length;
    return !strokeStepFinal.value && currentStrokeOptions.value.some((choice) => oneFootValidAt(level, choice.value));
  }
  return false;
});

// Selects the compatible variants of the current step and every following one,
// stopping at the first step without one. The short-name step is never touched,
// so the default name stays for manual review.
function autoSelectVariants() {
  while (autoSelectAvailable.value) {
    const branch = elementChangeBranch.value;
    if (branch === "turn") {
      const level = turnPath.value.length;
      const option = currentTurnOptions.value.find((choice) => validFlagAt("turn", level, choice.value));
      if (!option) break;
      onTurnChange(option.value);
    } else if (branch === "twoFeetTurn") {
      const level = twoFeetPath.value.length;
      const option = currentTwoFeetTurnOptions.value.find((choice) => validFlagAt("twoFeetTurn", level, choice.value));
      if (!option) break;
      onTwoFeetTurnChange(option.value);
    } else if (branch === "jump") {
      const option = currentJumpOptions.value.find((choice) => jumpTypeValid(choice.value));
      if (!option) break;
      onJumpChange(option.value);
    } else if (branch === "glide") {
      const level = glidePath.value.length;
      const option = currentGlideOptions.value.find((choice) => oneFootValidAt(level, choice.value));
      if (!option) break;
      onGlideChange(option.value);
    } else if (branch === "stroke") {
      const level = strokePath.value.length;
      const option = currentStrokeOptions.value.find((choice) => oneFootValidAt(level, choice.value));
      if (!option) break;
      onStrokeChange(option.value);
    } else {
      break;
    }
  }
}

const chosenLabels = computed<string[]>(() => {
  if (!elementChangeBranch.value) return [];
  if (elementChangeBranch.value === "jump") {
    const labels = [t("editor.kinds.jump")];
    jumpPath.value.forEach((value, level) => {
      const options =
        level === 0 ? jumpHandednessOptions.value : level === 1 ? jumpTypeChoices : jumpRevolutionOptions.value;
      const option = options.find((choice) => choice.value === value);
      if (option) labels.push(option.label);
    });
    return labels;
  }
  if (elementChangeBranch.value === "twoFeetTurn") {
    const labels = [t("editor.kinds.twoFeetTurn")];
    twoFeetPath.value.forEach((value, level) => {
      const options: { label: string; value: string }[] | undefined =
        level === 0
          ? twoFeetTurnGroupOptions.value
          : twoFeetTurnLevelOptionsByGroup.value[twoFeetTurnGroup.value]?.[level - 1];
      const option = options?.find((choice) => choice.value === value);
      if (option) labels.push(option.label);
    });
    return labels;
  }
  if (elementChangeBranch.value === "spin") {
    const labels = [t("editor.kinds.spin")];
    spinPath.value.forEach((value, level) => {
      if (level === 4) {
        labels.push(t("editor.spins.revolutionsCount", { count: Number(value) }));
        return;
      }
      const options =
        level === 0
          ? jumpHandednessOptions.value
          : level === 1
            ? spinFootLevelOptions.value
            : level === 2
              ? spinEdgeLevelOptions.value
              : spinTypeLevelOptions.value;
      const option = options.find((choice) => choice.value === value);
      if (option) labels.push(option.label);
    });
    return labels;
  }
  if (elementChangeBranch.value === "glide") {
    const labels = [t("editor.kinds.glide")];
    glidePath.value.forEach((value, level) => {
      const options =
        level === 1 && glidePath.value[0] === "TwoFoot"
          ? glideTwoFeetOptions.value
          : level === 2 && (glidePath.value[1] === "SpreadEagle" || glidePath.value[1] === "InaBauer")
            ? glidePoseFrontFootOptions.value
            : glideLevelOptions.value[level];
      const option = options?.find((choice) => choice.value === value);
      if (option) labels.push(option.label);
    });
    return labels;
  }
  if (elementChangeBranch.value === "stroke") {
    const labels = [t("editor.kinds.stroke")];
    strokePath.value.forEach((value, level) => {
      const option = strokeLevelOptions.value[level]?.find((choice) => choice.value === value);
      if (option) labels.push(option.label);
    });
    return labels;
  }
  const labels = [t("editor.kinds.oneFootTurn")];
  turnPath.value.forEach((value, level) => {
    const options: { label: string; value: string }[] | undefined =
      level === 0 ? turnGroupOptions.value : turnLevelOptionsByGroup.value[turnGroup.value]?.[level - 1];
    const option = options?.find((choice) => choice.value === value);
    if (option) labels.push(option.label);
  });
  return labels;
});

const sharedHelpItems: HelpItem[] = [
  { keys: ["v"], descriptions: ["switchView"] },
  { keys: ["p"], descriptions: ["switchPath"] },
  { keys: ["e"], descriptions: ["switchElements"] },
  { keys: ["t"], descriptions: ["switchTiming"] },
  { keys: ["a"], descriptions: ["switchAnnotations"] },
  { keys: ["space"], descriptions: ["togglePlayback"] },
  { keys: ["ctrl", "z"], descriptions: ["undo"] },
  { keys: ["ctrl", "y"], descriptions: ["redo"] },
  { keys: ["ctrl", "shift", "z"], descriptions: ["redo"] },
  { keys: ["leftArrow"], descriptions: ["cursorBack"] },
  { keys: ["rightArrow"], descriptions: ["cursorForward"] },
];

// Touch gestures stand alone: one finger taps and drags like the primary
// button, two fingers pinch to zoom and drag to move the view.
const touchItems: Record<EditMode, HelpItem[]> = {
  view: [{ keys: ["oneFinger"], descriptions: ["moveView"] }],
  path: [
    {
      keys: ["oneFinger"],
      descriptions: ["controlSelect", "lineSelect", "drawSelection", "curveMove", "pointsMove"],
    },
  ],
  elements: [
    {
      keys: ["oneFinger"],
      descriptions: ["elementCreate", "drawSelection", "elementCreateRange", "elementMove"],
    },
  ],
  timing: [
    {
      keys: ["oneFinger"],
      descriptions: ["timingSelect", "timingCreate", "drawSelection", "timingCreateRelease", "timingMove"],
    },
  ],
  annotations: [
    {
      keys: ["oneFinger"],
      descriptions: [
        "annotationCreate",
        "annotationSelect",
        "drawSelection",
        "annotationCreateRange",
        "annotationMove",
      ],
    },
  ],
};
const twoFingersItem: HelpItem = { keys: ["twoFingers"], descriptions: ["pinchZoomDragView"] };

const modeHelpItems = computed<HelpItem[]>(() =>
  editMode.value === "view"
    ? [
        { keys: ["leftDrag"], descriptions: ["moveView"] },
        { keys: ["rightDrag"], descriptions: ["moveView"] },
        { keys: ["wheel"], descriptions: ["zoom"] },
        ...sharedHelpItems,
      ]
    : editMode.value === "timing"
      ? [
          {
            keys: ["leftClick"],
            descriptions: ["timingSelect", "timingCreate"],
          },
          {
            keys: ["leftDrag"],
            descriptions: ["drawSelection", "timingCreateRelease"],
          },
          { keys: ["drag"], descriptions: ["timingMove"] },
          { keys: ["ctrl", "leftClick"], descriptions: ["selectionAddRemove"] },
          { keys: ["rightDrag"], descriptions: ["moveView"] },
          { keys: ["wheel"], descriptions: ["zoom"] },
          { keys: ["plus"], descriptions: ["timingOpenDialogPlus"] },
          { keys: ["minus"], descriptions: ["timingRemove"] },
          { keys: ["cog"], descriptions: ["timingOpenDialogCog"] },
          ...sharedHelpItems,
        ]
      : editMode.value === "annotations"
        ? [
            {
              keys: ["leftClick"],
              descriptions: ["annotationCreate", "annotationSelect"],
            },
            {
              keys: ["leftDrag"],
              descriptions: ["drawSelection", "annotationCreateRange"],
            },
            { keys: ["drag"], descriptions: ["annotationMove"] },
            { keys: ["ctrl", "leftClick"], descriptions: ["selectionAddRemove"] },
            { keys: ["rightDrag"], descriptions: ["moveView"] },
            { keys: ["wheel"], descriptions: ["zoom"] },
            { keys: ["plus"], descriptions: ["annotationOpenDialogPlus"] },
            { keys: ["minus"], descriptions: ["annotationRemove"] },
            { keys: ["cog"], descriptions: ["annotationOpenDialogCog"] },
            ...sharedHelpItems,
          ]
        : editMode.value === "elements"
          ? [
              { keys: ["leftClick"], descriptions: ["elementCreate"] },
              {
                keys: ["leftDrag"],
                descriptions: ["drawSelection", "elementCreateRange"],
              },
              { keys: ["drag"], descriptions: ["elementMove"] },
              { keys: ["rightDrag"], descriptions: ["moveView"] },
              { keys: ["wheel"], descriptions: ["zoom"] },
              { keys: ["plus"], descriptions: ["elementOpenDialogPlus"] },
              { keys: ["minus"], descriptions: ["elementRemove"] },
              { keys: ["cog"], descriptions: ["elementOpenDialogCog"] },
              ...sharedHelpItems,
            ]
          : [
              {
                keys: ["leftClick"],
                descriptions: ["controlSelect", "lineSelect"],
              },
              { keys: ["leftDrag"], descriptions: ["drawSelection"] },
              {
                keys: ["drag"],
                descriptions: ["curveMove", "pointsMove"],
              },
              { keys: ["ctrl", "leftClick"], descriptions: ["selectionAddRemove"] },
              { keys: ["ctrl", "a"], descriptions: ["selectAll"] },
              { keys: ["rightDrag"], descriptions: ["moveView"] },
              { keys: ["wheel"], descriptions: ["zoom"] },
              {
                keys: ["plus"],
                descriptions: ["addSegment", "splitCurve"],
              },
              { keys: ["minus"], descriptions: ["pointRemove"] },
              ...sharedHelpItems,
            ],
);

const helpItems = computed<HelpItem[]>(() => [...modeHelpItems.value, ...touchItems[editMode.value], twoFingersItem]);

let editor: Editor | null = null;
const isTracking = ref(false);
const trackingStage = ref<"barycenter" | "cursor">("barycenter");

// The pane above the canvas hides part of it, and its height depends on its
// content, so the editor reads it fresh at each fit.
const elementsPane = ref<InstanceType<typeof TimeSyncPane> | null>(null);
function paneElement(pane: unknown) {
  return (pane as { $el?: HTMLElement | null } | null)?.$el ?? null;
}
const occludedTop = () => paneElement(elementsPane.value)?.offsetHeight ?? 0;
let paneObserver: ResizeObserver | null = null;
watch(elementsPane, (pane) => {
  paneObserver?.disconnect();
  paneObserver = null;
  const el = paneElement(pane);
  // A vanished pane hides nothing anymore, so the rink recenters on the full canvas.
  if (!el) {
    editor?.refit();
    return;
  }
  if (typeof ResizeObserver === "undefined") return;
  paneObserver = new ResizeObserver(() => editor?.refit());
  paneObserver.observe(el);
});
onBeforeUnmount(() => paneObserver?.disconnect());

const store = useSequenceEditorStore();
const appearance = useAppearanceStore();
const { canUndo, canRedo } = storeToRefs(store);

const sequences = computed(() => store.getSequences());
const activeSequence = computed(() => store.getActiveSequence());
const hiddenSequenceSet = computed(() => new Set(sequences.value.filter((sequence) => !store.isVisible(sequence))));

function getBpm(): number {
  return store.getDiagram().bpm || 120;
}

const bpm = computed(() => getBpm());

const backgroundImage = computed(() => store.getDiagram().backgroundImage);
const backgroundImageOpacity = computed(() => store.getDiagram().backgroundImageOpacity ?? 1);
const diagramSymmetric = computed(() => store.getDiagram().symmetric === true);

// The bpm can change from the sidebar, so the canvas editor follows through here.
watch(bpm, (value) => {
  if (editor) editor.bpm = value;
  editor?.draw();
});

const shortDrawRange = computed({
  get: () => store.getShortDrawRange(),
  set: (value) => store.setShortDrawRange(value),
});

watch(
  shortDrawRange,
  (value) => {
    if (!editor) return;
    editor.shortDrawRange = value;
    editor.requestDraw();
  },
  { immediate: true },
);

const videoRef = ref<HTMLVideoElement | null>(null);
const videoUrl = computed(() => store.getDiagram().videoUrl ?? "");
const videoSet = computed(() => videoUrl.value.trim() !== "");
const videoStatus = ref<"empty" | "pending" | "valid" | "invalid">("empty");
const videoValid = computed(() => videoStatus.value === "valid");

// The background image lives in the diagram, so the canvas editor follows the store here.
watch(
  backgroundImage,
  (dataUrl) => {
    editor?.setBackgroundImage(dataUrl ?? undefined);
  },
  { immediate: true },
);

watch(
  backgroundImageOpacity,
  (value) => {
    if (!editor) return;
    editor.backgroundImageOpacity = value;
    editor.requestDraw();
  },
  { immediate: true },
);

// The symmetric traces live in the diagram options, so the canvas editor follows the store here.
watch(
  diagramSymmetric,
  (value) => {
    if (!editor) return;
    editor.symmetric = value;
    editor.requestDraw();
  },
  { immediate: true },
);

const { speed: playbackSpeed, options: playbackSpeedOptions, apply: applyPlaybackSpeed } = usePlaybackSpeed(videoRef);
// The extent is a computed: the playback loop reads it once per frame, so the
// cached value avoids a full timing resolution at the frame rate.
const timeExtent = computed(() => fullTimeExtentSeconds(store.getDiagram().sequences, getBpm()));
const {
  seconds: videoTime,
  setTimestamp,
  playing,
  play: playAnimation,
  pause: pauseAnimation,
} = useVideoTimestamp(videoRef, {
  speed: playbackSpeed,
  extent: () => timeExtent.value,
});
const {
  stage: loopStage,
  toggle: toggleLoop,
  reset: resetLoop,
  drawWindow: loopDrawWindow,
  bounds: loopBounds,
} = usePlaybackLoop(videoTime, playing, setTimestamp);
const loopAriaLabel = computed(() =>
  loopStage.value === "idle"
    ? t("player.loopA")
    : loopStage.value === "armed"
      ? t("player.loopB")
      : t("player.loopStop"),
);
// The loop stage changes the drawn window, so a paused toggle still repaints.
watch(loopStage, () => {
  editor?.requestDraw();
});
const { step: stepTimeCursor } = useTimeCursorStepping(videoRef, {
  seconds: videoTime,
  setTimestamp,
  extent: () => timeExtent.value,
  hasVideo: () => videoSet.value,
});

// A freshly loaded or created diagram snaps the timestamp back to the earliest
// timestamp in it. Regular detail edits trigger the store reactivity with the
// same diagram object, so the watch only fires on the identity change.
const seenDiagram = computed(() => store.getDiagram());
watch(seenDiagram, (diagram) => {
  resetLoop();
  const earliest = earliestTimeKeyframeSeconds(diagram);
  if (earliest !== null) setTimestamp(earliest);
});

watch(
  videoUrl,
  (value) => {
    videoStatus.value = value.trim() !== "" ? "pending" : "empty";
    resetLoop();
    pauseAnimation();
  },
  { immediate: true },
);

function togglePlayback() {
  if (playing.value) pauseAnimation();
  else playAnimation();
}

function toggleTracking() {
  if (!editor) return;
  // The editor advances its own cycle: it starts tracking at the barycenter,
  // then each visible cursor, then back to the barycenter.
  editor.followTimeCursor();
}

usePlaybackKeyToggle(togglePlayback);

let resumeAfterScrub = false;

// Scroll/drag gestures on the elements pane act like a canvas time cursor scrub:
// pause the playback during the gesture, resume it when the gesture has settled.
function onPaneScrubStart() {
  if (!playing.value) return;
  resumeAfterScrub = true;
  pauseAnimation();
}

function onPaneScrubEnd() {
  if (!resumeAfterScrub) return;
  resumeAfterScrub = false;
  playAnimation();
}

function jumpToStart() {
  const bounds = timeExtent.value;
  if (bounds) {
    setTimestamp(bounds[0]);
    return;
  }
  setTimestamp(earliestTimeKeyframeSeconds(store.getDiagram()) ?? 0);
}

watch(
  videoValid,
  (valid) => {
    if (!valid || !editor) return;
    editor.videoTimeSeconds = videoTime.value;
    editor.requestDraw();
  },
  { immediate: true },
);

const timingTypeOptions = computed(() => [
  { label: t("editor.timing.timeOption"), value: "time" },
  { label: t("editor.timing.beatsLabel"), value: "beats" },
]);
const timingKeyframeOpen = ref(false);
const timingTarget = shallowRef<TimingKeyframe | null>(null);
const timingIsProvisional = ref(false);
const timingKind = ref<TimingKind>("time");
const timingDecelerateTo = ref(false);
const timingAccelerateFrom = ref(false);
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

const annotationOpen = ref(false);
const annotationTarget = shallowRef<Annotation | null>(null);
const annotationIsProvisional = ref(false);
const annotationTitleDraft = ref(t("editor.dialog.annotationDefault"));
const annotationDescriptionDraft = ref("");
const annotationColorDraft = ref(DEFAULT_ANNOTATION_COLOR);
const annotationColor = computed({
  get: () => annotationColorDraft.value.replace(/^#/, ""),
  set: (value: string) => {
    annotationColorDraft.value = `#${value}`;
  },
});

function openAnnotationChange(annotation: Annotation) {
  annotationTarget.value = annotation;
  annotationIsProvisional.value = editor?.isProvisionalAnnotation(annotation) ?? false;
  annotationTitleDraft.value = annotation.title;
  annotationDescriptionDraft.value = annotation.description;
  annotationColorDraft.value = annotation.color;
  annotationOpen.value = true;
}

function closeAnnotationChange() {
  annotationOpen.value = false;
  annotationTarget.value = null;
}

function commitAnnotationChange() {
  const target = annotationTarget.value;
  if (!target) {
    closeAnnotationChange();
    return;
  }
  target.title = annotationTitleDraft.value.trim() || t("editor.dialog.annotationDefault");
  target.description = annotationDescriptionDraft.value;
  target.color = annotationColorDraft.value;
  if (annotationIsProvisional.value) {
    editor?.commitProvisionalAnnotation(target);
  }
  store.saveToStorage();
  editor?.draw();
  closeAnnotationChange();
}

const inputMode = useInputModeStore();

const pathCreation = shallowRef<PathCreationState | null>(null);
// The finish callback fires after onPathCreationChange(null), so the flow kind
// outlives the creation state to decide whether the finish dialog opens.
let pathCreationIsNew = true;
const sequenceFinishOpen = ref(false);
const finishSequenceTarget = shallowRef<Sequence | null>(null);
const finishNameDraft = ref("");
const finishColorLDraft = ref("");
const finishColorRDraft = ref("");
const finishColorL = computed({
  get: () => finishColorLDraft.value.replace(/^#/, ""),
  set: (value: string) => {
    finishColorLDraft.value = `#${value}`;
  },
});
const finishColorR = computed({
  get: () => finishColorRDraft.value.replace(/^#/, ""),
  set: (value: string) => {
    finishColorRDraft.value = `#${value}`;
  },
});

const pathCreationPlacing = computed(() => pathCreation.value?.phase === "placing");

const pathCreationBanner = computed(() => {
  const state = pathCreation.value;
  if (!state) return null;
  const touch = inputMode.mode === "touch";
  return {
    title: t(state.isNew ? "editor.pathCreation.newSequence" : "editor.pathCreation.addPoints"),
    instruction: t(
      pathCreationPlacing.value
        ? touch
          ? "editor.pathCreation.placingTouch"
          : "editor.pathCreation.placing"
        : touch
          ? "editor.pathCreation.awaitStartTouch"
          : "editor.pathCreation.awaitStart",
    ),
  };
});

const toast = useToast();
const PATH_CREATION_TOAST_GROUP = "path-creation";

// One sticky toast mirrors the active path creation: added once on start,
// its title, instruction and buttons render from the reactive refs below so
// the content updates in place; the group is removed on finish or cancel.
const pathCreationToastShown = ref(false);

function syncPathCreationToast(state: PathCreationState | null) {
  if (!state) {
    pathCreationToastShown.value = false;
    toast.removeGroup(PATH_CREATION_TOAST_GROUP);
    return;
  }
  if (pathCreationToastShown.value) return;
  pathCreationToastShown.value = true;
  toast.add({ group: PATH_CREATION_TOAST_GROUP, closable: false });
}

function finishPathCreation() {
  editor?.finishSequenceCreation();
}

function cancelPathCreation() {
  editor?.cancelSequenceCreation();
}

const canvasAreaEl = ref<HTMLElement | null>(null);
const pathToastLeft = ref("50%");
// Sits above the ~3.25rem playback bar with a 0.5rem gap so the toast never covers its buttons.
const PATH_TOAST_BOTTOM = "3.75rem";

// The toast teleports to body and the theme centers it on the viewport, but it
// must center on the canvas pane itself (the splitter shifts it when a video
// pane is open), so its center is measured from the canvas area element.
function updatePathToastLeft() {
  const rect = canvasAreaEl.value?.getBoundingClientRect();
  if (!rect) return;
  pathToastLeft.value = `${rect.left + rect.width / 2}px`;
}

let canvasAreaObserver: ResizeObserver | null = null;
watch(canvasAreaEl, (el) => {
  canvasAreaObserver?.disconnect();
  canvasAreaObserver = null;
  if (!el || typeof ResizeObserver === "undefined") return;
  canvasAreaObserver = new ResizeObserver(updatePathToastLeft);
  canvasAreaObserver.observe(el);
  updatePathToastLeft();
});
onBeforeUnmount(() => canvasAreaObserver?.disconnect());

const pathToastPt = computed(() => ({
  root: {
    style: { left: pathToastLeft.value, bottom: PATH_TOAST_BOTTOM, width: "18.75rem" },
  },
}));

function commitSequenceFinish() {
  const sequence = finishSequenceTarget.value;
  if (!sequence) {
    closeSequenceFinish();
    return;
  }
  const name = finishNameDraft.value.trim();
  if (name && name !== sequence.name) store.renameSequence(sequence, name);
  if (finishColorLDraft.value !== sequence.traceColorL) store.setTraceColor(sequence, "footL", finishColorLDraft.value);
  if (finishColorRDraft.value !== sequence.traceColorR) store.setTraceColor(sequence, "footR", finishColorRDraft.value);
  editor?.draw();
  closeSequenceFinish();
}

function closeSequenceFinish() {
  sequenceFinishOpen.value = false;
  finishSequenceTarget.value = null;
}

watch(
  () => store.creationRequest,
  (sequence) => {
    if (!sequence) return;
    editMode.value = "path";
    // Desktop renders the sidebar as an always-visible aside; only the mobile
    // bottom drawer closes when a creation starts.
    if (isMobile.value) drawerOpen.value = false;
    editor?.startSequenceCreation(sequence);
    store.consumeCreationRequest();
  },
);

const viewportWidth = ref(0);
const viewportHeight = ref(0);

const splitLayout = computed(() => {
  const sidebarSpace = !isMobile.value ? 360 : 0;
  return (viewportWidth.value - sidebarSpace) / viewportHeight.value > 1 ? "horizontal" : "vertical";
});

const splitterRoot = ref<{ $el?: HTMLElement | null } | null>(null);
const videoPaneSize = ref(40);
const PANE_SELECTOR = ".editor-view__video-pane";

// The panel percentage does not map linearly to pixels, so the 16/9 size
// converges from the measured pane against the wanted target.
function updateVideoPaneSize(thenAgain = false) {
  if (!videoSet.value) {
    if (videoPaneSize.value !== 0) videoPaneSize.value = 0;
    return;
  }
  const root = splitterRoot.value?.$el ?? null;
  // The 16/9 ratio applies to any vertical split and to a mobile horizontal
  // split; only a desktop side-by-side split keeps the fixed 50% base for
  // the canvas pane when the video pane is 40. A desktop vertical split needs
  // the measured root, so it waits for a next check.
  if (splitLayout.value === "horizontal" && !isMobile.value) {
    if (videoPaneSize.value !== 40) videoPaneSize.value = 40;
    return;
  }
  if (!root) return;
  const pane = root.querySelector<HTMLElement>(PANE_SELECTOR);
  if (!pane) return;
  const vertical = splitLayout.value === "vertical";
  const splitterW = root.clientWidth;
  const splitterH = root.clientHeight;
  if (splitterW <= 0 || splitterH <= 0) return;
  const target = vertical
    ? Math.min((splitterW * 9) / 16, splitterH / 2)
    : Math.min((splitterH * 16) / 9, splitterW / 2);
  const current = vertical ? pane.clientHeight : pane.clientWidth;
  if (Math.abs(current - target) <= 1.5) return;
  const previous = videoPaneSize.value;
  const next =
    previous <= 0.5 || current <= 2
      ? Math.min(95, Math.max(2, (target / (vertical ? splitterH : splitterW)) * 100 * 1.15))
      : Math.min(95, Math.max(2, (previous * target) / current));
  if (Math.abs(next - previous) < 0.05) return;
  videoPaneSize.value = next;
  if (thenAgain) {
    requestAnimationFrame(() => requestAnimationFrame(() => updateVideoPaneSize(true)));
  }
}

// Both pane bases sum to exactly 100 on any 16/9 split: no growth distortion.
const canvasPaneSize = computed(() =>
  videoSet.value && (splitLayout.value === "vertical" || isMobile.value) ? 100 - videoPaneSize.value : 50,
);

let splitterObserver: ResizeObserver | null = null;

watch(splitterRoot, async (root, previous) => {
  if (previous !== root) {
    splitterObserver?.disconnect();
    splitterObserver = null;
  }
  await nextTick();
  const el = root?.$el ?? null;
  if (el && !splitterObserver && typeof ResizeObserver !== "undefined") {
    splitterObserver = new ResizeObserver(() => updateVideoPaneSize(true));
    splitterObserver.observe(el);
  }
  updateVideoPaneSize(true);
});

watch([videoSet, isMobile, splitLayout], () => {
  updateVideoPaneSize(true);
});

onBeforeUnmount(() => {
  splitterObserver?.disconnect();
  splitterObserver = null;
});

function updateViewportSizes() {
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
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

function prefillVideoTimestamp() {
  if (!videoValid.value) return;
  const seconds = videoTime.value;
  if (seconds <= 0) return;
  const target = timingTarget.value;
  if (!target || !editor) return;
  const owner = editor.getSequenceOfTimingKeyframe(target);
  if (!owner) return;
  if (timingPreviousValue.value !== null && seconds <= timingPreviousValue.value) return;
  const resolved = owner.resolveTimes(getBpm());
  const next = [...owner.keyframes.time]
    .filter((other) => other.pathCoordinate > target.pathCoordinate)
    .sort((a, b) => a.pathCoordinate - b.pathCoordinate)[0];
  if (next) {
    const nextTime = resolved.find((entry) => entry.keyframe === next)?.time ?? null;
    if (nextTime !== null && seconds >= nextTime) return;
  }
  timingValueDraft.value = formatTimingLabel(seconds);
}

function openTimingKeyframeChange(keyframe: TimingKeyframe, isProvisional: boolean) {
  timingTarget.value = keyframe;
  timingIsProvisional.value = isProvisional;
  timingOriginalKind.value = keyframe.kind;
  timingOriginalValue.value = keyframe.value;
  timingKind.value = keyframe.kind;
  timingDecelerateTo.value = keyframe.transitionIn === "smooth";
  timingAccelerateFrom.value = keyframe.transitionOut === "smooth";
  timingValueDraft.value = keyframe.kind === "time" ? formatTimingLabel(keyframe.value) : String(keyframe.value);
  timingValueError.value = null;
  if (isProvisional && keyframe.kind === "time") prefillVideoTimestamp();
  timingKeyframeOpen.value = true;
  focusTimingValueInput();
}

function onTimingKindChange(kind: TimingKind) {
  if (kind === timingKind.value) return;
  const parsed = parseTimingValue(timingValueDraft.value); // the draft still holds a value in the previous kind
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
  const transitionIn = timingDecelerateTo.value ? "smooth" : "linear";
  const transitionOut = timingAccelerateFrom.value ? "smooth" : "linear";
  if (timingIsProvisional.value) {
    const replacement = new TimingKeyframe(target.pathCoordinate, timingKind.value, value, transitionIn, transitionOut);
    const sequence = editor?.commitProvisionalTimingKeyframe(target, replacement);
    if (sequence) store.saveToStorage();
  } else {
    target.kind = timingKind.value;
    target.value = value;
    target.transitionIn = transitionIn;
    target.transitionOut = transitionOut;
    editor?.invalidateTimeCachesFor(target);
    store.saveToStorage();
  }
  editor?.draw();
  closeTimingKeyframe();
}

watch([timingValueDraft, timingKind, timingPreviousValue], () => {
  timingValueError.value = validateTimingValue(timingValueDraft.value);
});

watch(editMode, (mode) => {
  pauseAnimation();
  if (editor) {
    editor.mode = mode;
    editor.clearSelection();
    editor.draw();
  }
});

// The mode letters stay off while a modal dialog is open.
useEditorModeKeys(
  editMode,
  () => !(elementChangeOpen.value || timingKeyframeOpen.value || annotationOpen.value || sequenceFinishOpen.value),
);
useTimeCursorKeys(
  stepTimeCursor,
  () => !(elementChangeOpen.value || timingKeyframeOpen.value || annotationOpen.value || sequenceFinishOpen.value),
);
const canApplyHistory = () =>
  !(elementChangeOpen.value || timingKeyframeOpen.value || annotationOpen.value || sequenceFinishOpen.value);
useUndoRedoKeys(
  () => store.undo(),
  () => store.redo(),
  canApplyHistory,
);
// A finger tap emulates a mouse enter, so the tab tooltips must stay off while the touch is recent.
useTooltipTouchGuard();
watch(
  () => appearance.scaleElements,
  (value) => {
    if (editor) {
      editor.scaleElements = value;
      editor.draw();
    }
  },
  { immediate: true },
);

watch(
  () => appearance.showLabels,
  (value) => {
    if (editor) {
      editor.showLabels = value;
      editor.draw();
    }
  },
  { immediate: true },
);

watch(
  () => appearance.darkMode,
  (value) => {
    if (editor) {
      editor.darkMode = value;
      editor.draw();
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (!canvasRef.value) return;
  const editorInstance = new Editor(canvasRef.value, sequences.value, { occludedTop });
  editor = editorInstance;
  previousSequences = sequences.value;
  editorInstance.onTrackingChange = () => {
    isTracking.value = editorInstance.tracking;
    trackingStage.value = editorInstance.trackingStage === "cursor" ? "cursor" : "barycenter";
  };
  isTracking.value = editorInstance.tracking;
  trackingStage.value = editorInstance.trackingStage === "cursor" ? "cursor" : "barycenter";
  editorInstance.setHiddenSequences(hiddenSequenceSet.value);
  editorInstance.scaleElements = appearance.scaleElements;
  editorInstance.showLabels = appearance.showLabels;
  editorInstance.darkMode = appearance.darkMode;

  editorInstance.onVideoTimeChange = (seconds) => setTimestamp(seconds);
  editorInstance.onTimeScrubStart = () => {
    if (!playing.value) return;
    resumeAfterScrub = true;
    pauseAnimation();
  };
  editorInstance.onTimeScrubEnd = () => {
    if (!resumeAfterScrub) return;
    resumeAfterScrub = false;
    playAnimation();
  };
  editorInstance.activeSequence = activeSequence.value;
  editorInstance.bpm = getBpm();
  editorInstance.videoTimeSeconds = videoTime.value;
  editorInstance.setBackgroundImage(backgroundImage.value ?? undefined);
  editorInstance.backgroundImageOpacity = backgroundImageOpacity.value;
  editorInstance.symmetric = diagramSymmetric.value;
  editorInstance.shortDrawRange = store.getShortDrawRange();
  editorInstance.loopDrawWindow = () => loopDrawWindow.value;
  editorInstance.loopTimeBounds = () => loopBounds.value;
  editorInstance.onElementChangeRequest = (element) => {
    elementToChange.value = element;
    isProvisionalTarget.value = editorInstance.isProvisional(element);
    oldKind.value = isProvisionalTarget.value ? null : kindOfType(element.type);
    oldVariant.value = isProvisionalTarget.value ? null : parseVariantFlags(element.type);
    validVariant.value = null;
    validOneFootVariant.value = null;
    if (element instanceof TwoFeetTurn || element instanceof OneFootTurn) {
      const elementSequence = editorInstance.getSequenceOfElement(element);
      if (elementSequence) validVariant.value = checkTurnVariantValidity(elementSequence, element);
    }
    elementChangeBranch.value = null;
    glidePath.value = [];
    strokePath.value = [];
    turnPath.value = [];
    twoFeetPath.value = [];
    spinPath.value = [];
    clearPendingChoice();
    if (!isProvisionalTarget.value) openAtExistingVariant();
    elementChangeOpen.value = true;
  };
  editorInstance.onSequenceChange = () => store.saveToStorage();
  editorInstance.onTimingKeyframeChangeRequest = (keyframe, isProvisional, previous) => {
    timingPreviousValue.value = previous ? previous.value : null;
    openTimingKeyframeChange(keyframe, isProvisional);
  };
  editorInstance.onAnnotationChangeRequest = (annotation) => {
    openAnnotationChange(annotation);
  };
  editorInstance.onPathCreationChange = (state) => {
    pathCreation.value = state;
    if (state) pathCreationIsNew = state.isNew;
    syncPathCreationToast(state);
  };
  editorInstance.onSequenceCreationFinish = (sequence) => {
    if (!pathCreationIsNew) return;
    finishSequenceTarget.value = sequence;
    finishNameDraft.value = sequence.name;
    finishColorLDraft.value = sequence.traceColorL;
    finishColorRDraft.value = sequence.traceColorR;
    sequenceFinishOpen.value = true;
  };
  editorInstance.onSequenceCreationCancel = (sequence) => store.removeSequence(sequence);
});

let previousSequences: Sequence[] = [];
watch(sequences, (list) => {
  const sameMembers = list.length === previousSequences.length && list.every((s, i) => s === previousSequences[i]);
  previousSequences = list;
  if (!sameMembers && editor) editor.setSequences(list);
});

watch(hiddenSequenceSet, (next) => {
  editor?.setHiddenSequences(next);
});

watch([videoTime, activeSequence] as const, () => {
  if (!editor) return;
  editor.videoTimeSeconds = videoTime.value;
  editor.requestDraw();
});

// The active sequence changes rarely, so it follows the editor in a separate
// watch: the bpm has its own watch above, and the per-frame videoTime watch
// stays free of these writes.
watch(activeSequence, () => {
  if (!editor) return;
  editor.activeSequence = activeSequence.value;
  editor.requestDraw();
});

const visibleSequences = computed(() => sequences.value.filter((sequence) => store.isVisible(sequence)));

onMounted(() => {
  updateViewportSizes();
  window.addEventListener("resize", updateViewportSizes);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewportSizes);
});

onBeforeUnmount(() => {
  editor?.destroy();
  editor = null;
});

function redraw() {
  editor?.draw();
}

function clearPendingChoice() {
  pendingReplacement.value = null;
  shortNameDraft.value = "";
}

const currentStepFinal = computed(() => {
  switch (elementChangeBranch.value) {
    case "glide":
      return glideStepFinal.value || currentGlideOptions.value.length === 0;
    case "stroke":
      return strokeStepFinal.value || currentStrokeOptions.value.length === 0;
    case "turn":
      return turnStepFinal.value || currentTurnOptions.value.length === 0;
    case "twoFeetTurn":
      return twoFeetTurnStepFinal.value || currentTwoFeetTurnOptions.value.length === 0;
    case "jump":
      return jumpStepFinal.value || currentJumpOptions.value.length === 0;
    case "spin":
      return spinStepFinal.value;
    default:
      return false;
  }
});

const shortNameInputVisible = computed(() => !!elementChangeBranch.value && currentStepFinal.value);

watch([elementChangeOpen, shortNameInputVisible] as const, ([open, visible]) => {
  if (open && visible) {
    nextTick(focusShortNameInput);
  }
});

function focusShortNameInput() {
  (document.getElementById("element-short-name") as HTMLInputElement | null)?.focus();
}

function clearShortNameDraft() {
  shortNameDraft.value = "";
  focusShortNameInput();
}

const jumpHandednessOptions = computed(() => [
  { label: t("editor.jumps.rightHanded"), value: "Right" },
  { label: t("editor.jumps.leftHanded"), value: "Left" },
]);

const spinFootLevelOptions = computed(() => [
  { label: t("editor.spins.leftFoot"), value: "LeftFoot" },
  { label: t("editor.spins.rightFoot"), value: "RightFoot" },
]);

const spinEdgeLevelOptions = computed(() => [
  { label: t("editor.common.inside"), value: "Inside" },
  { label: t("editor.common.outside"), value: "Outside" },
]);

const spinTypeLevelOptions = computed(() => [
  { label: t("editor.spins.upright"), value: "upright" },
  { label: t("editor.spins.layback"), value: "layback" },
  { label: t("editor.spins.camel"), value: "camel" },
  { label: t("editor.spins.sit"), value: "sit" },
]);

const jumpRevolutionOptions = computed(() => [
  { label: t("editor.jumps.single"), value: "1" },
  { label: t("editor.jumps.double"), value: "2" },
  { label: t("editor.jumps.triple"), value: "3" },
  { label: t("editor.jumps.quadruple"), value: "4" },
]);

const jumpStepFinal = computed(() => jumpPath.value.length >= 3);

const currentJumpOptions = computed(() => {
  if (jumpStepFinal.value) return [];
  if (jumpPath.value.length === 0) return jumpHandednessOptions.value;
  if (jumpPath.value.length === 1) return jumpTypeChoices;
  return jumpRevolutionOptions.value;
});

const spinStepFinal = computed(() => spinPath.value.length >= 5);

const currentSpinOptions = computed(() => {
  if (spinPath.value.length === 0) return jumpHandednessOptions.value;
  if (spinPath.value.length === 1) return spinFootLevelOptions.value;
  if (spinPath.value.length === 2) return spinEdgeLevelOptions.value;
  if (spinPath.value.length === 3) return spinTypeLevelOptions.value;
  return [];
});

function spinTypeName(): string {
  const [, foot, edgeName] = spinPath.value;
  const side = foot === "LeftFoot" ? "Left" : "Right";
  return `${side}${edgeName}Spin`;
}

function onSpinChange(value: string) {
  spinPath.value = [...spinPath.value, value];
  if (spinPath.value.length === 4) {
    spinRevolutionsDraft.value = defaultSpinRevolutions;
    onFinalChoice(spinTypeName());
  }
}

function onSpinRevolutionsChange() {
  const revolutions = Math.max(1, Math.round(spinRevolutionsDraft.value ?? defaultSpinRevolutions));
  spinRevolutionsDraft.value = revolutions;
  spinPath.value = [...spinPath.value.slice(0, 4), String(revolutions)];
  onFinalChoice(spinTypeName());
}

function onJumpChange(value: string) {
  const next = [...jumpPath.value, value];
  // Euler only exists as a single rotation, so the revolution level is skipped.
  if (next.length === 2 && next[1] === "Euler") {
    next.push("1");
  }
  jumpPath.value = next;
  if (next.length >= 3) {
    const [, jump, revolutions] = next;
    onFinalChoice(`${jump}${revolutions}`);
  }
}

function openAtExistingVariant() {
  const element = elementToChange.value;
  if (element instanceof Spin) {
    const parsed = parseSpinType(element.type);
    const handedness = element.leftHanded ? "Left" : "Right";
    elementChangeBranch.value = "spin";
    spinPath.value = parsed
      ? [
          handedness,
          parsed.leftFoot ? "LeftFoot" : "RightFoot",
          parsed.inside ? "Inside" : "Outside",
          (element as Spin).spinType,
          String(element.revolutions),
        ]
      : [];
    spinRevolutionsDraft.value = element.revolutions;
    if (parsed) onFinalChoice(element.type);
    return;
  }
  if (element?.type && isJumpType(element.type)) {
    const parsed = parseJumpType(element.type);
    const handedness = (element as Jump).leftHanded ? "Left" : "Right";
    elementChangeBranch.value = "jump";
    jumpPath.value = parsed ? [handedness, parsed.jump, String(parsed.revolutions)] : [];
    if (parsed) onFinalChoice(element.type);
    return;
  }
  const flags = oldVariant.value;
  const branch = oldKind.value;
  if (!flags || !branch || !element || !element.type) {
    elementChangeBranch.value = null;
    return;
  }
  elementChangeBranch.value = branch;
  if (branch === "glide") {
    glidePath.value = flags.pose
      ? ["TwoFoot", flags.pose, flags.frontFoot ?? "Left"]
      : flags.twoFoot
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

function chooseElementBranch(branch: ElementKind) {
  elementChangeBranch.value = branch;
  validOneFootVariant.value = null;
  glidePath.value = [];
  strokePath.value = [];
  turnPath.value = [];
  twoFeetPath.value = [];
  jumpPath.value = [];
  spinPath.value = [];
  clearPendingChoice();
}

function onFinalChoice(type: string) {
  const target = elementToChange.value;
  if (!target) return;
  const leftHanded =
    elementChangeBranch.value === "jump"
      ? jumpPath.value[0] === "Left"
      : elementChangeBranch.value === "spin"
        ? spinPath.value[0] === "Left"
        : undefined;
  const spinType = elementChangeBranch.value === "spin" ? (spinPath.value[3] as SpinType | undefined) : undefined;
  const spinRevolutions =
    elementChangeBranch.value === "spin" ? Number(spinPath.value[4] ?? defaultSpinRevolutions) : undefined;
  const candidate = changeElementType(type, {
    type,
    start: target.start,
    end: target.end,
    leftHanded,
    spinType,
    revolutions: spinRevolutions,
  });
  pendingReplacement.value = candidate;
  shortNameDraft.value =
    !isProvisionalTarget.value && type === target.type ? target.shortName : candidate.defaultShortName;
}

function onGlideChange(value: string) {
  const next = [...glidePath.value, value];
  glidePath.value = next;
  if (next.length === 1) {
    validOneFootVariant.value = value === "TwoFoot" ? null : computeOneFootValidity(value);
  }
  const poseStep = next[0] === "TwoFoot" && (next[1] === "SpreadEagle" || next[1] === "InaBauer");
  if (next.length >= (next[0] === "TwoFoot" ? (poseStep ? 3 : 2) : 3)) {
    const [side, direction, third] = next;
    if (poseStep) {
      onFinalChoice(`${direction}${third}FrontGlide`);
    } else {
      onFinalChoice(
        side === "TwoFoot" ? `Both${direction}Glide` : `${side}${direction}${third === "Neither" ? "" : third}Glide`,
      );
    }
  }
}

function onStrokeChange(value: string) {
  const next = [...strokePath.value, value];
  strokePath.value = next;
  if (next.length === 1) validOneFootVariant.value = computeOneFootValidity(value);
  if (next.length >= strokeLevelOptions.value.length) {
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

function computeOneFootValidity(side: string): OneFootVariantValidity {
  const element = elementToChange.value;
  if (!element) return { forward: null, inside: null };
  const sequence = editor?.getSequenceOfElement(element);
  if (!sequence) return { forward: null, inside: null };
  return checkOneFootVariantValidity(sequence, element, side === "Left" ? "footL" : "footR");
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
  validOneFootVariant.value = null;
  glidePath.value = [];
  strokePath.value = [];
  turnPath.value = [];
  twoFeetPath.value = [];
  jumpPath.value = [];
  spinPath.value = [];
  clearPendingChoice();
}

function previousElementChangeStep() {
  if (elementChangeBranch.value === "jump" && jumpPath.value.length > 0) {
    let next = jumpPath.value.slice(0, -1);
    // Euler completes without the revolution level, so going back from it skips to the type level.
    if (next.length === 2 && next[1] === "Euler") {
      next = next.slice(0, -1);
    }
    jumpPath.value = next;
    clearPendingChoice();
    return;
  }
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
  if (elementChangeBranch.value === "spin" && spinPath.value.length > 0) {
    spinPath.value = spinPath.value.slice(0, -1);
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
    <DiagramSidebar
      v-model:open="drawerOpen"
      v-model:scale-elements="appearance.scaleElements"
      v-model:show-labels="appearance.showLabels"
      v-model:show-legend="appearance.showLegend"
      v-model:dark-mode="appearance.darkMode"
      mode="editor"
      :mobile="isMobile"
      :help-items="helpItems"
      :video-error="videoStatus === 'invalid'"
      @redraw="redraw"
    />

    <div class="editor-view__main">
      <div class="editor-view__modebar">
        <Tabs v-model:value="editMode" class="editor-view__mode-tabs">
          <TabList>
            <Tab v-for="mode in editModeOptions" :key="mode.value" :value="mode.value" v-tooltip.bottom="mode.key">
              <i :class="mode.icon" aria-hidden="true" />
              <small class="editor-view__mode-name">{{ mode.label }}</small>
            </Tab>
          </TabList>
        </Tabs>
      </div>
      <div class="editor-view__canvas">
        <Splitter
          ref="splitterRoot"
          :layout="splitLayout"
          :gutter-size="videoSet ? 10 : 0"
          class="editor-view__splitter"
          :class="{ 'editor-view__splitter--no-video': !videoSet }"
        >
          <SplitterPanel class="editor-view__video-pane" :size="videoPaneSize" :min-size="videoSet ? 10 : 0">
            <video
              v-if="videoSet"
              ref="videoRef"
              class="editor-view__video"
              :src="videoUrl"
              controls
              playsinline
              @loadeddata="onVideoLoad"
              @error="onVideoError"
            ></video>
          </SplitterPanel>
          <SplitterPanel class="editor-view__canvas-pane" :size="canvasPaneSize" :min-size="20">
            <div class="editor-view__canvas-area" ref="canvasAreaEl">
              <canvas ref="canvasRef" class="editor-view__canvas-element"></canvas>
              <TrackingButton :active="isTracking" :mode="trackingStage" @toggle="toggleTracking" />
              <UndoRedoButtons :can-undo="canUndo" :can-redo="canRedo" @undo="store.undo()" @redo="store.redo()" />
              <div v-if="editMode === 'view'" class="editor-view__elements">
                <TimeSyncPane
                  ref="elementsPane"
                  :sequences="visibleSequences"
                  :time-seconds="videoTime"
                  :bpm="bpm"
                  :loop-window="loopDrawWindow"
                  @seek="setTimestamp"
                  @scrub-start="onPaneScrubStart"
                  @scrub-end="onPaneScrubEnd"
                />
                <DiagramLegend
                  v-if="appearance.showLegend"
                  :sequences="visibleSequences"
                  :time-seconds="videoTime"
                  :bpm="bpm"
                />
              </div>
              <div v-if="sequences.length === 0" class="editor-view__empty-hint">
                <Button
                  :label="$t('editor.emptyCanvas.addSequence')"
                  icon="pi pi-plus"
                  severity="primary"
                  @click="store.addSequence()"
                />
              </div>
            </div>
          </SplitterPanel>
        </Splitter>
      </div>
      <div class="editor-view__player">
        <Button
          v-if="isMobile"
          icon="pi pi-bars"
          :aria-label="$t('player.openSettings')"
          severity="secondary"
          text
          rounded
          class="editor-view__player-menu"
          @click="drawerOpen = true"
        />
        <div class="editor-view__player-controls">
          <Button
            icon="pi pi-stopwatch"
            :aria-pressed="shortDrawRange"
            :aria-label="$t('player.shortRange')"
            severity="secondary"
            :text="!shortDrawRange"
            rounded
            size="small"
            @click="shortDrawRange = !shortDrawRange"
          />
          <Button
            icon="pi pi-step-backward"
            :aria-label="$t('player.jumpToStart')"
            severity="secondary"
            rounded
            size="small"
            @click="jumpToStart"
          />
          <Button
            :icon="playing ? 'pi pi-pause' : 'pi pi-play'"
            :aria-label="playing ? $t('player.pause') : $t('player.play')"
            rounded
            @click="togglePlayback"
          />
          <Button
            icon="pi pi-replay"
            :aria-label="loopAriaLabel"
            :severity="loopStage === 'idle' ? 'secondary' : 'primary'"
            rounded
            :class="{ 'editor-view__loop-armed': loopStage === 'armed' }"
            @click="toggleLoop"
          />
          <Select
            v-model="playbackSpeed"
            :options="playbackSpeedOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            size="small"
            :aria-label="$t('player.speed')"
            class="editor-view__speed"
          />
        </div>
      </div>
    </div>

    <Dialog
      v-model:visible="elementChangeOpen"
      :header="$t('editor.dialog.elementSelection')"
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
          v-if="elementChangeBranch === 'glide' && !glideStepFinal && currentGlideOptions.length > 0"
          :model-value="null"
          :options="currentGlideOptions"
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => onGlideChange(event.value)"
        >
          <template #option="{ option }">
            <span class="editor-view__option-row">
              <span :class="{ 'editor-view__option-old': oldValueAt('glide', glidePath.length, option.value) }">
                {{ option.label }}
              </span>
              <i
                v-if="oneFootValidAt(glidePath.length, option.value)"
                class="pi pi-check-circle editor-view__valid-check"
                :aria-label="$t('editor.dialog.validFlag')"
              ></i>
            </span>
          </template>
        </Listbox>

        <Listbox
          v-else-if="elementChangeBranch === 'stroke' && !strokeStepFinal && currentStrokeOptions.length > 0"
          :model-value="null"
          :options="currentStrokeOptions"
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => onStrokeChange(event.value)"
        >
          <template #option="{ option }">
            <span class="editor-view__option-row">
              <span :class="{ 'editor-view__option-old': oldValueAt('stroke', strokePath.length, option.value) }">
                {{ option.label }}
              </span>
              <i
                v-if="oneFootValidAt(strokePath.length, option.value)"
                class="pi pi-check-circle editor-view__valid-check"
                :aria-label="$t('editor.dialog.validFlag')"
              ></i>
            </span>
          </template>
        </Listbox>

        <Listbox
          v-else-if="elementChangeBranch === 'turn' && !turnStepFinal && currentTurnOptions.length > 0"
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
                :aria-label="$t('editor.dialog.validFlag')"
              ></i>
            </span>
          </template>
        </Listbox>

        <Listbox
          v-else-if="
            elementChangeBranch === 'twoFeetTurn' && !twoFeetTurnStepFinal && currentTwoFeetTurnOptions.length > 0
          "
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
                :aria-label="$t('editor.dialog.validFlag')"
              ></i>
            </span>
          </template>
        </Listbox>

        <Listbox
          v-else-if="elementChangeBranch === 'jump' && !jumpStepFinal && currentJumpOptions.length > 0"
          :model-value="null"
          :options="currentJumpOptions"
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => onJumpChange(event.value)"
        >
          <template #option="{ option }">
            <span class="editor-view__option-row">
              <span :class="{ 'editor-view__option-old': oldValueAt('jump', jumpPath.length, option.value) }">
                {{ option.label }}
              </span>
              <i
                v-if="jumpPath.length === 1 && jumpTypeValid(option.value)"
                class="pi pi-check-circle editor-view__valid-check"
                :aria-label="$t('editor.dialog.validJump')"
              ></i>
            </span>
          </template>
        </Listbox>

        <Listbox
          v-else-if="elementChangeBranch === 'spin' && !spinStepFinal && currentSpinOptions.length > 0"
          :model-value="null"
          :options="currentSpinOptions"
          option-value="value"
          scroll-height=""
          class="w-full"
          @change="(event) => onSpinChange(event.value)"
        >
          <template #option="{ option }">
            <span :class="{ 'editor-view__option-old': oldValueAt('spin', spinPath.length, option.value) }">
              {{ option.label }}
            </span>
          </template>
        </Listbox>

        <div v-else-if="elementChangeBranch === 'spin' && !spinStepFinal" class="editor-view__short-name">
          <label class="editor-view__mode-label" for="spin-revolutions">{{ $t("editor.dialog.revolutions") }}</label>
          <InputNumber
            id="spin-revolutions"
            v-model="spinRevolutionsDraft"
            :min="1"
            :step="1"
            :use-grouping="false"
            :max-fraction-digits="0"
            fluid
            @keyup.enter="onSpinRevolutionsChange"
          />
        </div>

        <div v-else class="editor-view__short-name">
          <label class="editor-view__mode-label" for="element-short-name">{{ $t("editor.dialog.shortName") }}</label>
          <InputGroup>
            <InputText
              id="element-short-name"
              v-model="shortNameDraft"
              class="w-full"
              autofocus
              @keydown.enter="commitElementChange"
            />
            <InputGroupAddon>
              <Button
                icon="pi pi-times"
                severity="secondary"
                text
                rounded
                size="small"
                aria-label="$t('editor.dialog.clearShortName')"
                @click="clearShortNameDraft"
              />
            </InputGroupAddon>
          </InputGroup>
        </div>
      </template>

      <template #footer>
        <Button
          v-if="currentStepFinal"
          :label="$t('editor.dialog.start')"
          severity="secondary"
          icon="pi pi-home"
          @click="startElementChange"
        />
        <Button
          v-if="elementChangeBranch"
          :label="$t('editor.dialog.previous')"
          severity="secondary"
          icon="pi pi-arrow-left"
          @click="previousElementChangeStep"
        />
        <Button
          v-if="autoSelectAvailable"
          :label="$t('editor.dialog.auto')"
          severity="primary"
          icon="pi pi-bolt"
          @click="autoSelectVariants"
        />
        <Button
          v-if="elementChangeBranch === 'spin' && !spinStepFinal && spinPath.length === 4"
          :label="$t('editor.dialog.next')"
          icon="pi pi-arrow-right"
          @click="onSpinRevolutionsChange"
        />
        <Button
          v-if="currentStepFinal"
          :label="$t('editor.dialog.ok')"
          icon="pi pi-check"
          @click="commitElementChange"
        />
        <Button
          v-else
          :label="$t('editor.dialog.close')"
          severity="secondary"
          icon="pi pi-times"
          @click="closeElementChange"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="timingKeyframeOpen"
      :header="$t('editor.dialog.timingKeyframe')"
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
        {{ $t("editor.timing.beatsCaption") }}
      </p>
      <div class="editor-view__timing-value">
        <label class="editor-view__mode-label" for="timing-value">{{
          timingKind === "time" ? $t("editor.timing.timeLabel") : $t("editor.timing.beatsLabel")
        }}</label>
        <InputGroup v-if="timingKind === 'time'">
          <InputText
            id="timing-value"
            ref="timingTimeInput"
            v-model="timingValueDraft"
            class="w-full"
            :invalid="timingValueInvalid"
            autofocus
            @keydown.enter="commitTimingKeyframe"
          />
          <InputGroupAddon>
            <div class="editor-view__timing-arrows">
              <Button
                icon="pi pi-chevron-up"
                severity="secondary"
                text
                rounded
                size="small"
                :aria-label="$t('editor.timing.increaseOneSecond')"
                @click="stepTimingValue(1)"
              />
              <Button
                icon="pi pi-chevron-down"
                severity="secondary"
                text
                rounded
                size="small"
                :aria-label="$t('editor.timing.decreaseOneSecond')"
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
          @keydown.enter="commitTimingKeyframe"
        />
        <small v-if="timingValueInvalid" class="editor-view__timing-error">
          {{
            timingValueError === "bounds"
              ? $t("editor.timing.errorBounds")
              : timingKind === "time"
                ? $t("editor.timing.errorTimeFormat")
                : $t("editor.timing.errorBeatsFormat")
          }}
        </small>
        <div class="editor-view__timing-transitions">
          <div class="editor-view__timing-transition">
            <ToggleSwitch v-model="timingDecelerateTo" input-id="timing-decelerate-to" />
            <label for="timing-decelerate-to">{{ $t("editor.timing.decelerateTo") }}</label>
          </div>
          <div class="editor-view__timing-transition">
            <ToggleSwitch v-model="timingAccelerateFrom" input-id="timing-accelerate-from" />
            <label for="timing-accelerate-from">{{ $t("editor.timing.accelerateFrom") }}</label>
          </div>
        </div>
      </div>
      <template #footer>
        <Button :label="$t('editor.dialog.ok')" icon="pi pi-check" @click="commitTimingKeyframe" />
        <Button
          :label="$t('editor.dialog.close')"
          severity="secondary"
          icon="pi pi-times"
          @click="closeTimingKeyframe"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="annotationOpen"
      :header="$t('editor.dialog.annotation')"
      modal
      class="editor-view__annotation-dialog"
      @hide="closeAnnotationChange"
    >
      <div class="editor-view__annotation-fields">
        <label class="editor-view__mode-label" for="annotation-title">{{ $t("editor.annotationFields.title") }}</label>
        <InputText
          id="annotation-title"
          v-model="annotationTitleDraft"
          class="w-full"
          autofocus
          @keydown.enter="commitAnnotationChange"
        />
        <label class="editor-view__mode-label" for="annotation-description">{{
          $t("editor.annotationFields.description")
        }}</label>
        <Textarea
          id="annotation-description"
          v-model="annotationDescriptionDraft"
          class="w-full"
          rows="3"
          auto-resize
        />
        <label class="editor-view__mode-label" for="annotation-color">{{ $t("editor.annotationFields.color") }}</label>
        <ColorPicker id="annotation-color" v-model="annotationColor" />
      </div>
      <template #footer>
        <Button :label="$t('editor.dialog.ok')" icon="pi pi-check" @click="commitAnnotationChange" />
        <Button
          :label="$t('editor.dialog.close')"
          severity="secondary"
          icon="pi pi-times"
          @click="closeAnnotationChange"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="sequenceFinishOpen"
      :header="$t('editor.pathCreation.newSequence')"
      modal
      class="editor-view__sequence-finish-dialog"
      @hide="closeSequenceFinish"
    >
      <div class="editor-view__annotation-fields">
        <label class="editor-view__mode-label" for="sequence-finish-name">{{ $t("editor.pathCreation.name") }}</label>
        <InputText id="sequence-finish-name" v-model="finishNameDraft" class="w-full" autofocus />
        <span class="editor-view__finish-color-row">
          <span class="editor-view__finish-swatch-wrapper" :style="{ background: finishColorLDraft || undefined }">
            <ColorPicker
              id="sequence-finish-color-l"
              class="editor-view__finish-swatch"
              :model-value="finishColorL"
              :aria-label="$t('editor.pathCreation.colorLeft')"
              @update:model-value="(value) => (finishColorL = String(value))"
            />
            <span
              class="editor-view__finish-swatch-letter"
              :style="{ color: textColorFor(finishColorLDraft || '#ffffff') }"
              >{{ $t("sequence.footLetterL") }}</span
            >
          </span>
          <label class="editor-view__mode-label" for="sequence-finish-color-l">{{
            $t("editor.pathCreation.colorLeft")
          }}</label>
        </span>
        <span class="editor-view__finish-color-row">
          <span class="editor-view__finish-swatch-wrapper" :style="{ background: finishColorRDraft || undefined }">
            <ColorPicker
              id="sequence-finish-color-r"
              class="editor-view__finish-swatch"
              :model-value="finishColorR"
              :aria-label="$t('editor.pathCreation.colorRight')"
              @update:model-value="(value) => (finishColorR = String(value))"
            />
            <span
              class="editor-view__finish-swatch-letter"
              :style="{ color: textColorFor(finishColorRDraft || '#ffffff') }"
              >{{ $t("sequence.footLetterR") }}</span
            >
          </span>
          <label class="editor-view__mode-label" for="sequence-finish-color-r">{{
            $t("editor.pathCreation.colorRight")
          }}</label>
        </span>
      </div>
      <template #footer>
        <Button :label="$t('editor.dialog.ok')" icon="pi pi-check" @click="commitSequenceFinish" />
        <Button :label="$t('sequence.cancel')" severity="secondary" icon="pi pi-times" @click="closeSequenceFinish" />
      </template>
    </Dialog>

    <Toast group="path-creation" position="bottom-center" class="editor-view__path-toast" :pt="pathToastPt">
      <template #message>
        <div v-if="pathCreation" class="editor-view__path-toast-content">
          <span class="editor-view__path-toast-title">{{ pathCreationBanner?.title }}</span>
          <span class="editor-view__path-toast-instruction">{{ pathCreationBanner?.instruction }}</span>
          <div class="editor-view__path-toast-actions">
            <Button
              v-if="pathCreationPlacing"
              :label="$t('editor.pathCreation.finish')"
              size="small"
              :disabled="(pathCreation.curveCount ?? 0) < 1"
              @click="finishPathCreation"
            />
            <Button :label="$t('sequence.cancel')" severity="secondary" size="small" @click="cancelPathCreation" />
          </div>
        </div>
      </template>
    </Toast>
  </div>
</template>

<style scoped lang="scss">
.editor-view {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.editor-view__main {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}

.editor-view__modebar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
}

/* The mode tabs span the width, one icon above and one small label below each tab. */
.editor-view__mode-tabs,
.editor-view__mode-tabs :deep(.p-tablist-tab-list) {
  width: 100%;
}

.editor-view__mode-tabs :deep(.p-tab) {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  padding: 0.625rem 0.25rem 0.375rem;
}

.editor-view__mode-tabs :deep(.pi) {
  font-size: 1rem;
}

.editor-view__mode-name {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.editor-view__player {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0.375rem 0.75rem;
  border-top: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
}

/* The hamburger stays left; the controls group centers on the bar. */
.editor-view__player-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 auto;
}

/* The speed select reads as a fixed-width chip: no arrow, centered label. */
/* A loop point waits for its partner: the armed button pulses until the loop closes. */
.editor-view__loop-armed {
  animation: editor-view-loop-pulse 1.1s ease-in-out infinite;
}

@keyframes editor-view-loop-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .editor-view__loop-armed {
    animation: none;
  }
}

.editor-view__speed {
  width: 3.25rem;
  height: 2rem;
  align-items: center;
  border-radius: 9999px;

  :deep(.p-select-label) {
    padding: 0 0.25rem;
    text-align: center;
  }

  :deep(.p-select-dropdown) {
    display: none;
  }
}

.editor-view__canvas {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  background: white;
}

.editor-view__splitter {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: none;
  border-radius: 0;
  background: white;
}

.editor-view__splitter--no-video :deep(.p-splitter-gutter) {
  display: none;
}

/* The splitter panels grow by default: pin the video panel when the url is empty. */
.editor-view__splitter--no-video :deep(.editor-view__video-pane) {
  flex-grow: 0;
  width: 0;
  min-width: 0;
}

.editor-view__video-pane {
  position: relative;
  display: flex;
  background: black;
  overflow: hidden;
}

.editor-view__video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.editor-view__canvas-pane {
  position: relative;
  display: flex;
  overflow: hidden;
  background: var(--p-content-background);
}

.editor-view__canvas-area {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

/* The elements pane wrapper floats above the canvas, so its rows can change
   without resizing the canvas or the playback bar below. */
.editor-view__elements {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  width: auto;
  z-index: 5;
}

/* The toast content reads as one left-aligned block: title, instruction and
   the actions row all flush left. */
.editor-view__path-toast-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 0.375rem;
}

.editor-view__path-toast-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.editor-view__path-toast-instruction {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.editor-view__path-toast-actions {
  display: flex;
  gap: 0.5rem;
}

.editor-view__empty-hint {
  position: absolute;
  bottom: 0.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  color: var(--p-text-muted-color);
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

.editor-view__finish-color-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

/* Mirrors the sequences-list swatch in DiagramSidebarSequences (extract a shared
   component if a third usage appears). */
.editor-view__finish-swatch-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background-color: #ffffff;
}

.editor-view__finish-swatch {
  display: inline-flex;
}

.editor-view__finish-swatch :deep(input.p-colorpicker-preview) {
  display: block;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  font-size: 0;
  cursor: pointer;
}

.editor-view__finish-swatch-letter {
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

.editor-view__annotation-dialog {
  width: 320px;
  max-width: 90vw;
  min-width: 0;
}

.editor-view__annotation-dialog .p-dialog-content {
  display: flex;
  flex-direction: column;
}

.editor-view__annotation-fields {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.editor-view__annotation-fields > label {
  margin-top: 0.5rem;
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

.editor-view__timing-transitions {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 0.5rem;
}

.editor-view__timing-transition {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.editor-view__timing-transition label {
  cursor: pointer;
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

/* The toast teleports to body, so the surface styles cannot stay scoped. */
.editor-view__path-toast .p-toast-message {
  background: var(--p-content-background);
}

.editor-view__sequence-finish-dialog {
  width: 300px;
  max-width: 90vw;
}
</style>
