import { shallowRef, triggerRef } from "vue";
import { defineStore } from "pinia";
import { BothForwardGlide } from "@/engine/element/glide";
import { Curve } from "@/engine/curve";
import { Diagram, type DiagramJSON } from "@/engine/diagram";
import { Path } from "@/engine/path";
import { Sequence, type SequenceJSON } from "@/engine/sequence";
import { Vector } from "@/engine/vector";
import type { PathCoordinate } from "@/engine/coordinates";

const STORAGE_KEY = "sequence-editor";
const DEFAULT_SEQUENCE_NAME = "Sequence";

function defaultSequence(): Sequence {
  const path = new Path();
  path.curves.push(new Curve(new Vector(-2.5, 0), new Vector(-0.5, 0), new Vector(0.5, 0), new Vector(2.5, 0)));
  path.updateLength();
  const sequence = new Sequence(path);
  sequence.addElement(new BothForwardGlide(0 as PathCoordinate, 0 as PathCoordinate));
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
  const activeSequence = shallowRef<Sequence | null>(diagram.value.sequences[0] ?? null);
  const hiddenSequences = shallowRef<Set<Sequence>>(new Set());

  function getDiagram(): Diagram {
    return diagram.value;
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

  // Structural changes rebuild the sequences array instead of mutating it in place:
  // the view's computed chain reads this array, so a new identity keeps the list reactive.
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

  function setDiagramName(name: string) {
    const trimmed = name.trim();
    if (trimmed) diagram.value.name = trimmed;
    triggerRef(diagram);
    saveToStorage();
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(diagram.value.toJSON()));
    } catch (error) {
      console.error("Could not store the diagram:", error);
    }
  }

  function loadFromJSON(json: DiagramJSON) {
    const next = Diagram.fromJSON(json);
    if (next.sequences.length === 0) next.sequences.push(defaultSequence());
    diagram.value = next;
    activeSequence.value = next.sequences[0] ?? null;
    hiddenSequences.value = new Set();
    triggerRef(diagram);
    saveToStorage();
  }

  function toJSON(): string {
    return JSON.stringify(diagram.value.toJSON(), null, 2);
  }

  function clear() {
    const next = defaultDiagram();
    diagram.value = next;
    activeSequence.value = next.sequences[0] ?? null;
    hiddenSequences.value = new Set();
    triggerRef(diagram);
    saveToStorage();
  }

  return {
    diagram,
    getDiagram,
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
    setDiagramName,
    saveToStorage,
    loadFromJSON,
    toJSON,
    clear,
  };
});
