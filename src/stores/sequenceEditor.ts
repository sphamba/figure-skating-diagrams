import { ref, shallowRef, triggerRef } from "vue";
import { defineStore } from "pinia";
import { BothForwardGlide } from "@/engine/element/glide";
import { applyParts, EditHistory, type EditStep } from "@/engine/sequenceEditor/editHistory";
import { DEFAULT_START_ELEMENT_LENGTH } from "@/engine/sequenceEditor/editor";
import { Curve } from "@/engine/curve";
import { Diagram, type DiagramJSON } from "@/engine/diagram";
import { Path } from "@/engine/path";
import { Sequence, type FootKey, type SequenceJSON } from "@/engine/sequence";
import { Vector } from "@/engine/vector";
import type { PathCoordinate } from "@/engine/coordinates";

const STORAGE_KEY = "sequence-editor";
const SHORT_DRAW_RANGE_KEY = "sequence-editor-short-draw-range";
const FILENAME_KEY = "sequence-editor-filename";
const DEFAULT_FILENAME = "diagram.json";
const DEFAULT_SEQUENCE_NAME = "Sequence";
// World axes: the canvas negates y, so world +x draws right and world -y draws
// down. A duplicate lands 5 m to the bottom right of its original.
const DUPLICATE_SHIFT = new Vector<2>(5, -5);

function defaultSequence(): Sequence {
  const path = new Path();
  path.curves.push(new Curve(new Vector(-2.5, 0), new Vector(-0.5, 0), new Vector(0.5, 0), new Vector(2.5, 0)));
  path.updateLength();
  const sequence = new Sequence(path);
  const half = DEFAULT_START_ELEMENT_LENGTH / 2;
  sequence.addElement(new BothForwardGlide(-half as PathCoordinate, half as PathCoordinate));
  return sequence;
}

function defaultDiagram(): Diagram {
  const sequence = defaultSequence();
  sequence.name = `${DEFAULT_SEQUENCE_NAME} 1`;
  return new Diagram("Diagram", [sequence]);
}

function loadStoredDiagram(): Diagram {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const json = JSON.parse(raw) as DiagramJSON | SequenceJSON;
      if (Array.isArray((json as DiagramJSON).sequences)) return Diagram.fromJSON(json as DiagramJSON);
      return new Diagram("Diagram", [Sequence.fromJSON(json as SequenceJSON)]);
    }
    return defaultDiagram();
  } catch (error) {
    console.error("Could not read the stored diagram:", error);
    localStorage.removeItem(STORAGE_KEY);
    return defaultDiagram();
  }
}

function loadStoredShortDrawRange(): boolean {
  try {
    return localStorage.getItem(SHORT_DRAW_RANGE_KEY) === "true";
  } catch (error) {
    console.error("Could not read the stored short draw range:", error);
    return false;
  }
}

function storeShortDrawRange(value: boolean) {
  try {
    localStorage.setItem(SHORT_DRAW_RANGE_KEY, String(value));
  } catch (error) {
    console.error("Could not store the short draw range:", error);
  }
}

// The filename is hidden state: it only pre-fills the download name.
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop()?.trim() ?? "";
  return base !== "" ? base : DEFAULT_FILENAME;
}

function loadStoredFilename(): string {
  try {
    const raw = localStorage.getItem(FILENAME_KEY);
    return raw ? sanitizeFilename(raw) : DEFAULT_FILENAME;
  } catch (error) {
    console.error("Could not read the stored filename:", error);
    return DEFAULT_FILENAME;
  }
}

function storeFilename(value: string) {
  try {
    localStorage.setItem(FILENAME_KEY, value);
  } catch (error) {
    console.error("Could not store the filename:", error);
  }
}

const HISTORY_KEY = "sequence-editor-history";

export const useSequenceEditorStore = defineStore("sequenceEditor", () => {
  const diagram = shallowRef<Diagram>(loadStoredDiagram());
  const shortDrawRange = ref(loadStoredShortDrawRange());
  const saveFilename = ref(loadStoredFilename());
  const activeSequence = shallowRef<Sequence | null>(diagram.value.sequences[0] ?? null);
  const hiddenSequences = shallowRef<Set<Sequence>>(new Set());
  const jsonBaseline = ref<string>(JSON.stringify(diagram.value.toJSON(), null, 2));
  const history = new EditHistory({ storage: localStorage, storageKey: HISTORY_KEY });
  const canUndo = ref(false);
  const canRedo = ref(false);
  let applyingHistory = false;

  function syncHistoryState() {
    canUndo.value = history.canUndo;
    canRedo.value = history.canRedo;
  }

  if (!history.rehydrate(JSON.stringify(diagram.value.toJSON()))) {
    history.reset(JSON.stringify(diagram.value.toJSON()));
  }
  syncHistoryState();

  function getDiagram(): Diagram {
    return diagram.value;
  }

  function getShortDrawRange(): boolean {
    return shortDrawRange.value;
  }

  function setShortDrawRange(value: boolean) {
    shortDrawRange.value = value;
    storeShortDrawRange(value);
  }

  function getSaveFilename(): string {
    return saveFilename.value;
  }

  function setSaveFilename(name: string) {
    saveFilename.value = sanitizeFilename(name);
    storeFilename(saveFilename.value);
  }

  function getActiveSequence(): Sequence | null {
    return activeSequence.value;
  }

  function getSequences(): Sequence[] {
    return diagram.value.sequences;
  }

  function isVisible(sequence: Sequence): boolean {
    return !hiddenSequences.value.has(sequence);
  }

  function toggleVisible(sequence: Sequence) {
    const next = new Set(hiddenSequences.value);
    if (next.has(sequence)) next.delete(sequence);
    else next.add(sequence);
    hiddenSequences.value = next;
  }

  function setVisible(sequence: Sequence, visible: boolean) {
    if (visible === isVisible(sequence)) return;
    toggleVisible(sequence);
  }

  function setActiveSequence(sequence: Sequence) {
    if (!diagram.value.sequences.includes(sequence)) return;
    activeSequence.value = sequence;
  }

  function uniqueSequenceName(sequences: Sequence[]): string {
    const names = new Set(sequences.map((sequence) => sequence.name));
    let index = sequences.length + 1;
    while (names.has(`${DEFAULT_SEQUENCE_NAME} ${index}`)) index++;
    return `${DEFAULT_SEQUENCE_NAME} ${index}`;
  }

  function addSequence() {
    const sequence = defaultSequence();
    sequence.name = uniqueSequenceName(diagram.value.sequences);
    diagram.value.sequences = [...diagram.value.sequences, sequence];
    activeSequence.value = sequence;
    triggerRef(diagram);
    saveToStorage();
  }

  function removeSequence(sequence: Sequence) {
    const index = diagram.value.sequences.indexOf(sequence);
    if (index === -1) return;
    let next = diagram.value.sequences.filter((candidate) => candidate !== sequence);
    if (next.length === 0) {
      const fallback = defaultSequence();
      fallback.name = uniqueSequenceName(next);
      next = [...next, fallback];
    }
    if (activeSequence.value === sequence || !next.includes(activeSequence.value as Sequence)) {
      activeSequence.value = next[0] ?? null;
    }
    hiddenSequences.value = new Set([...hiddenSequences.value].filter((candidate) => next.includes(candidate)));
    diagram.value.sequences = next;
    triggerRef(diagram);
    saveToStorage();
  }

  function renameSequence(sequence: Sequence, name: string) {
    const trimmed = name.trim();
    if (trimmed) sequence.name = trimmed;
    triggerRef(diagram);
    saveToStorage();
  }

  function duplicateSequence(sequence: Sequence) {
    if (!diagram.value.sequences.includes(sequence)) return;
    const copy = Sequence.fromJSON(sequence.toJSON());
    copy.name = uniqueSequenceName(diagram.value.sequences);
    copy.path.translate(DUPLICATE_SHIFT);
    diagram.value.sequences = [...diagram.value.sequences, copy];
    activeSequence.value = copy;
    triggerRef(diagram);
    saveToStorage();
  }

  // The sequence is mirrored in place, so the sequences array keeps its
  // identity and the sidebar emits the canvas redraw itself.
  function mirrorSequence(sequence: Sequence, axis: "horizontal" | "vertical") {
    if (!diagram.value.sequences.includes(sequence)) return;
    if (axis === "horizontal") sequence.mirrorHorizontal();
    else sequence.mirrorVertical();
    triggerRef(diagram);
    saveToStorage();
  }

  function setTraceColor(sequence: Sequence, footKey: FootKey, color: string) {
    if (footKey === "footL") sequence.traceColorL = color;
    else sequence.traceColorR = color;
    triggerRef(diagram);
    saveToStorage(true);
  }

  function setDiagramName(name: string) {
    const trimmed = name.trim();
    if (trimmed) diagram.value.name = trimmed;
    triggerRef(diagram);
    saveToStorage(true);
  }

  function setDiagramBpm(bpm: number | undefined) {
    if (bpm !== undefined && (!Number.isFinite(bpm) || bpm <= 0)) return;
    diagram.value.bpm = bpm;
    triggerRef(diagram);
    saveToStorage(true);
  }

  function setDiagramVideoUrl(videoUrl: string) {
    diagram.value.videoUrl = videoUrl.trim() !== "" ? videoUrl : undefined;
    triggerRef(diagram);
    saveToStorage(true);
  }

  // The image travels as a base64 data URL, so it fits inside the stored and exported json.
  function setDiagramBackgroundImage(dataUrl: string) {
    const trimmed = dataUrl.trim();
    diagram.value.backgroundImage = trimmed !== "" ? trimmed : undefined;
    triggerRef(diagram);
    saveToStorage();
  }

  function setDiagramBackgroundImageOpacity(value: number) {
    if (!Number.isFinite(value)) return;
    diagram.value.backgroundImageOpacity = Math.min(1, Math.max(0, value));
    triggerRef(diagram);
    saveToStorage(true);
  }

  function setDiagramSymmetric(value: boolean) {
    diagram.value.symmetric = value;
    triggerRef(diagram);
    saveToStorage();
  }

  function saveToStorage(allowCoalesce = false) {
    const json = JSON.stringify(diagram.value.toJSON());
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch (error) {
      console.error("Could not store the diagram:", error);
    }
    triggerRef(diagram);
    if (applyingHistory) return;
    // A deliberate action (canvas gesture, dialog OK, button click) is one
    // step and never merges. Only continuous inputs such as typed text, the
    // slider and the color picker coalesce inside the window.
    history.commit(json, allowCoalesce);
    syncHistoryState();
  }

  // Applies a recorded step and rebuilds the sequences array reference, so the
  // EditorView sequences watch fires and the canvas editor replaces its sequences.
  function applyHistoryStep(step: EditStep, state: "previous" | "next") {
    applyingHistory = true;
    try {
      const target = diagram.value;
      const active = activeSequence.value;
      const activeIndex = active === null ? -1 : target.sequences.indexOf(active);
      const hiddenIndices = [...hiddenSequences.value]
        .map((sequence) => target.sequences.indexOf(sequence))
        .filter((index) => index >= 0);
      const listChanges = step.parts.some((part) => part.kind === "sequences");
      const touchesSequences = step.parts.some((part) => part.kind !== "diagram");
      // The copy must happen before the apply: applyParts assigns members of
      // the current array, and a held reference (the canvas editor sequences,
      // the view member compare) must never see the rebuild in place, or the
      // identity compare misses the change and the canvas stays stale.
      if (touchesSequences) target.sequences = [...target.sequences];
      applyParts(target, step.parts, state);
      if (listChanges) hiddenSequences.value = new Set();
      else
        hiddenSequences.value = new Set(
          hiddenIndices.map((index) => target.sequences[index]).filter((s): s is Sequence => Boolean(s)),
        );
      if (activeIndex >= 0 && activeIndex < target.sequences.length)
        activeSequence.value = target.sequences[activeIndex]!;
      else activeSequence.value = target.sequences[0] ?? null;
      saveToStorage();
    } finally {
      applyingHistory = false;
    }
    syncHistoryState();
  }

  function undo(): string | null {
    const step = history.undo();
    if (!step) return null;
    applyHistoryStep(step, "previous");
    return step.label;
  }

  function redo(): string | null {
    const step = history.redo();
    if (!step) return null;
    applyHistoryStep(step, "next");
    return step.label;
  }

  function loadFromJSON(json: DiagramJSON) {
    const next = Diagram.fromJSON(json);
    if (next.sequences.length === 0) next.sequences.push(defaultSequence());
    diagram.value = next;
    activeSequence.value = next.sequences[0] ?? null;
    hiddenSequences.value = new Set();
    // The load itself is not an edit, so the recording stays off until the
    // reset primes the baseline with the loaded state.
    applyingHistory = true;
    try {
      saveToStorage();
    } finally {
      applyingHistory = false;
    }
    history.reset(JSON.stringify(diagram.value.toJSON()));
    syncHistoryState();
    markSaved();
  }

  function toJSON(): string {
    return JSON.stringify(diagram.value.toJSON(), null, 2);
  }

  function getJSON(): string {
    return JSON.stringify(diagram.value.toJSON(), null, 2);
  }

  function markSaved() {
    jsonBaseline.value = getJSON();
  }

  function isUnsaved(): boolean {
    return getJSON() !== jsonBaseline.value;
  }

  function clear() {
    const next = defaultDiagram();
    diagram.value = next;
    activeSequence.value = next.sequences[0] ?? null;
    hiddenSequences.value = new Set();
    applyingHistory = true;
    try {
      saveToStorage();
    } finally {
      applyingHistory = false;
    }
    history.reset(JSON.stringify(diagram.value.toJSON()));
    syncHistoryState();
    markSaved();
    saveFilename.value = DEFAULT_FILENAME;
    storeFilename(saveFilename.value);
  }

  return {
    diagram,
    getDiagram,
    getShortDrawRange,
    setShortDrawRange,
    getSaveFilename,
    setSaveFilename,
    getActiveSequence,
    getSequences,
    isVisible,
    toggleVisible,
    setVisible,
    setActiveSequence,
    uniqueSequenceName,
    addSequence,
    removeSequence,
    renameSequence,
    duplicateSequence,
    mirrorSequence,
    setTraceColor,
    setDiagramName,
    setDiagramBpm,
    setDiagramVideoUrl,
    setDiagramBackgroundImage,
    setDiagramBackgroundImageOpacity,
    setDiagramSymmetric,
    saveToStorage,
    loadFromJSON,
    toJSON,
    getJSON,
    markSaved,
    isUnsaved,
    clear,
    undo,
    redo,
    canUndo,
    canRedo,
  };
});
