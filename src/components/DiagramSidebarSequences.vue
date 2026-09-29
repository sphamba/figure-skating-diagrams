<script setup lang="ts">
import { computed, nextTick, ref, shallowRef } from "vue";
import Button from "openvue/button";
import ColorPicker from "openvue/colorpicker";
import ConfirmPopup from "openvue/confirmpopup";
import Dialog from "openvue/dialog";
import Inplace from "openvue/inplace";
import InputText from "openvue/inputtext";
import Listbox from "openvue/listbox";
import ToggleSwitch from "openvue/toggleswitch";
import { useConfirm } from "openvue/useconfirm";
import { useI18n } from "vue-i18n";
import { textColorFor } from "@/utils/contrast";
import { useSequenceEditorStore } from "@/stores/sequenceEditor";
import type { Sequence, FootKey } from "@/engine/sequence";

const props = defineProps<{ mode: "home" | "editor" }>();

// The parent redraws the canvas after a trace color change.
const emit = defineEmits<{ redraw: [] }>();

const isEditor = computed(() => props.mode === "editor");

const store = useSequenceEditorStore();
const confirm = useConfirm();
const { t } = useI18n();

const sequences = computed(() => store.getSequences());
const activeSequence = computed(() => store.getActiveSequence());

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

const footSwatches = computed(() => [
  { footKey: "footL" as FootKey, letter: t("sequence.footLetterL") },
  { footKey: "footR" as FootKey, letter: t("sequence.footLetterR") },
]);

function traceColorAria(option: Sequence, footKey: FootKey): string {
  const name = sequenceInfos.value.get(option)?.name ?? t("sequence.fallbackName");
  const foot = t(footKey === "footL" ? "sequence.footL" : "sequence.footR");
  return t("sequence.traceColorAria", { name, foot });
}

const selectedSequence = computed({
  get: () => activeSequence.value,
  set: (value) => {
    if (value) store.setActiveSequence(value);
  },
});

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
  emit("redraw");
}

const confirmPopupRef = ref<{ alignOverlay: () => void } | null>(null);

type SequenceAction = "duplicate" | "mirror-horizontal" | "mirror-vertical";

const sequenceActionKind = shallowRef<SequenceAction | null>(null);
const sequenceActionOpen = ref(false);

const sequenceActionHeader = computed(() => {
  switch (sequenceActionKind.value) {
    case "duplicate":
      return t("sequence.dialogDuplicate");
    case "mirror-horizontal":
      return t("sequence.dialogMirrorH");
    case "mirror-vertical":
      return t("sequence.dialogMirrorV");
    default:
      return "";
  }
});

function openSequenceAction(kind: SequenceAction) {
  sequenceActionKind.value = kind;
  sequenceActionOpen.value = true;
}

function closeSequenceAction() {
  sequenceActionOpen.value = false;
}

// The path is mirrored in place, so the sequences array keeps its identity and
// the parent canvas needs the explicit redraw the trace color change uses.
function applySequenceAction(target: Sequence) {
  const kind = sequenceActionKind.value;
  if (!kind || !target) return;
  if (kind === "duplicate") store.duplicateSequence(target);
  else {
    store.mirrorSequence(target, kind === "mirror-horizontal" ? "horizontal" : "vertical");
    emit("redraw");
  }
  closeSequenceAction();
}

function confirmDelete(sequence: Sequence, event: Event) {
  confirm.require({
    group: "diagram-sidebar-delete",
    target: event.currentTarget as HTMLElement,
    message: t("sequence.deleteConfirm", { name: sequence.name }),
    icon: "pi pi-exclamation-triangle",
    rejectLabel: t("sequence.cancel"),
    acceptLabel: t("sequence.deleteLabel"),
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
</script>

<template>
  <div class="diagram-sidebar__sequences">
    <label class="diagram-sidebar__mode-label">{{ $t("sequence.label") }}</label>
    <Listbox v-model="selectedSequence" :options="sequences" option-label="name" class="diagram-sidebar__sequence-list">
      <template #option="{ option }">
        <ToggleSwitch
          :model-value="store.isVisible(option)"
          :aria-label="store.isVisible(option) ? $t('sequence.hideAria') : $t('sequence.showAria')"
          @update:model-value="store.toggleVisible(option)"
          @click.stop
        />
        <span class="diagram-sidebar__swatches">
          <span
            v-for="swatch in footSwatches"
            :key="swatch.footKey"
            class="diagram-sidebar__swatch-wrapper"
            :style="isEditor ? undefined : { background: sequenceInfos.get(option)?.[swatch.footKey] }"
            @click.stop
          >
            <ColorPicker
              v-if="isEditor"
              class="diagram-sidebar__swatch"
              :aria-label="traceColorAria(option, swatch.footKey)"
              :model-value="sequenceInfos.get(option)?.[swatch.footKey]"
              @update:model-value="(value) => setTraceColor(option, swatch.footKey, `#${value}`)"
            />
            <span
              class="diagram-sidebar__swatch-letter"
              :style="{ color: textColorFor(sequenceInfos.get(option)?.[swatch.footKey] ?? '#ffffff') }"
              >{{ swatch.letter }}</span
            >
          </span>
        </span>
        <Inplace
          v-if="isEditor"
          class="diagram-sidebar__sequence-name"
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
        <span v-else class="diagram-sidebar__sequence-name diagram-sidebar__sequence-display-name">{{
          sequenceInfos.get(option)?.name
        }}</span>
        <Button
          v-if="isEditor"
          icon="pi pi-trash"
          :aria-label="$t('sequence.deleteAria')"
          severity="danger"
          text
          rounded
          size="small"
          @click.stop="confirmDelete(option, $event)"
        />
      </template>
    </Listbox>
    <div v-if="isEditor" class="diagram-sidebar__sequence-tools">
      <Button :label="$t('sequence.add')" icon="pi pi-plus" severity="secondary" text @click="store.addSequence()" />
      <div class="diagram-sidebar__sequence-actions">
        <Button
          icon="pi pi-clone"
          :aria-label="$t('sequence.duplicateAria')"
          severity="secondary"
          text
          rounded
          size="small"
          v-tooltip.bottom="t('sequence.tooltipDuplicate')"
          @click="openSequenceAction('duplicate')"
        />
        <Button
          icon="pi pi-arrows-h"
          :aria-label="$t('sequence.mirrorHAria')"
          severity="secondary"
          text
          rounded
          size="small"
          v-tooltip.bottom="t('sequence.tooltipMirrorH')"
          @click="openSequenceAction('mirror-horizontal')"
        />
        <Button
          icon="pi pi-arrows-v"
          :aria-label="$t('sequence.mirrorVAria')"
          severity="secondary"
          text
          rounded
          size="small"
          v-tooltip.bottom="t('sequence.tooltipMirrorV')"
          @click="openSequenceAction('mirror-vertical')"
        />
      </div>
    </div>
    <ConfirmPopup ref="confirmPopupRef" group="diagram-sidebar-delete" />
    <Dialog
      v-model:visible="sequenceActionOpen"
      :header="sequenceActionHeader"
      modal
      class="diagram-sidebar__sequence-action-dialog"
      @hide="sequenceActionKind = null"
    >
      <Listbox
        :model-value="null"
        :options="sequences"
        option-label="name"
        @change="(event) => applySequenceAction(event.value)"
      >
        <template #option="{ option }">
          <span class="diagram-sidebar__swatches">
            <span
              v-for="swatch in footSwatches"
              :key="swatch.letter"
              class="diagram-sidebar__swatch-wrapper"
              :style="{ background: sequenceInfos.get(option)?.[swatch.footKey] }"
            >
              <span
                class="diagram-sidebar__swatch-letter"
                :style="{ color: textColorFor(sequenceInfos.get(option)?.[swatch.footKey] ?? '#ffffff') }"
                >{{ swatch.letter }}</span
              >
            </span>
          </span>
          <span class="diagram-sidebar__sequence-display-name">{{ sequenceInfos.get(option)?.name }}</span>
        </template>
      </Listbox>
      <template #footer>
        <Button :label="$t('sequence.cancel')" severity="secondary" icon="pi pi-times" @click="closeSequenceAction" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped lang="scss">
.diagram-sidebar__sequences {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.diagram-sidebar__sequence-list {
  width: 100%;
}

.diagram-sidebar__sequence-list :deep(.p-listbox-option) {
  width: 100%;
  padding-block: 0.2rem;
}

.diagram-sidebar__sequence-name {
  flex: 1;
  min-width: 0;
}

.diagram-sidebar__sequence-display-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagram-sidebar__sequence-name :deep(.p-inplace-content) {
  width: 100%;
  min-width: 0;
}

.diagram-sidebar__sequence-name :deep(.p-inplace-content .p-inputtext) {
  width: 100%;
  min-width: 0;
}

.diagram-sidebar__swatches {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-inline: 0.25rem;
}

.diagram-sidebar__swatch-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background-color: #ffffff;
}

.diagram-sidebar__swatch {
  display: inline-flex;
}

.diagram-sidebar__swatch :deep(input.p-colorpicker-preview) {
  display: block;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  font-size: 0;
  cursor: pointer;
}

.diagram-sidebar__swatch-letter {
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

.diagram-sidebar__sequence-tools {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.diagram-sidebar__sequence-actions {
  display: flex;
  gap: 0.25rem;
}
</style>

<style lang="scss">
/* Dialog root teleports to body, scoped attributes never reach it */
.diagram-sidebar__sequence-action-dialog {
  width: 300px;
  max-width: 90vw;
}

.diagram-sidebar__sequence-action-dialog .p-listbox {
  width: 100%;
}
</style>
