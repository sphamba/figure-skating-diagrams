import { ref, shallowRef, triggerRef } from "vue";
import { defineStore } from "pinia";
import { BothForwardGlide } from "@/engine/element/glide";
import { DEFAULT_START_ELEMENT_LENGTH } from "@/engine/sequenceEditor/editor";
import { Curve } from "@/engine/curve";
import { Diagram, type DiagramJSON } from "@/engine/diagram";
import { Path } from "@/engine/path";
import { Sequence, type FootKey, type SequenceJSON } from "@/engine/sequence";
import { Vector } from "@/engine/vector";
import type { PathCoordinate } from "@/engine/coordinates";

const STORAGE_KEY = "sequence-editor";
const DEFAULT_SEQUENCE_NAME = "Sequence";

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

export const useSequenceEditorStore = defineStore("sequenceEditor", () => {
  const diagram = shallowRef<Diagram>(loadStoredDiagram());
  const shortDrawRange = ref(false);
  const activeSequence = shallowRef<Sequence | null>(diagram.value.sequences[0] ?? null);
  const hiddenSequences = shallowRef<Set<Sequence>>(new Set());
  const jsonBaseline = ref<string>(JSON.stringify(diagram.value.toJSON(), null, 2));

  function getDiagram(): Diagram {
    return diagram.value;
  }

  function getShortDrawRange(): boolean {
    return shortDrawRange.value;
  }

  function setShortDrawRange(value: boolean) {
    shortDrawRange.value = value;
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

  function setTraceColor(sequence: Sequence, footKey: FootKey, color: string) {
    if (footKey === "footL") sequence.traceColorL = color;
    else sequence.traceColorR = color;
    triggerRef(diagram);
    saveToStorage();
  }

  function setDiagramName(name: string) {
    const trimmed = name.trim();
    if (trimmed) diagram.value.name = trimmed;
    triggerRef(diagram);
    saveToStorage();
  }

  function setDiagramBpm(bpm: number | undefined) {
    if (bpm !== undefined && (!Number.isFinite(bpm) || bpm <= 0)) return;
    diagram.value.bpm = bpm;
    triggerRef(diagram);
    saveToStorage();
  }

  function setDiagramVideoUrl(videoUrl: string) {
    diagram.value.videoUrl = videoUrl.trim() !== "" ? videoUrl : undefined;
    triggerRef(diagram);
    saveToStorage();
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
    saveToStorage();
  }

  function setDiagramSymmetric(value: boolean) {
    diagram.value.symmetric = value;
    triggerRef(diagram);
    saveToStorage();
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(diagram.value.toJSON()));
    } catch (error) {
      console.error("Could not store the diagram:", error);
    }
    triggerRef(diagram);
  }

  function loadFromJSON(json: DiagramJSON) {
    const next = Diagram.fromJSON(json);
    if (next.sequences.length === 0) next.sequences.push(defaultSequence());
    diagram.value = next;
    activeSequence.value = next.sequences[0] ?? null;
    hiddenSequences.value = new Set();
    triggerRef(diagram);
    saveToStorage();
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
    triggerRef(diagram);
    saveToStorage();
    markSaved();
  }

  return {
    diagram,
    getDiagram,
    getShortDrawRange,
    setShortDrawRange,
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
  };
});
