import { shallowRef } from "vue";
import { defineStore } from "pinia";
import { BothForwardGlide } from "@/engine/element/glide";
import { Curve } from "@/engine/curve";
import { Path } from "@/engine/path";
import { Sequence, type SequenceJSON } from "@/engine/sequence";
import { Vector } from "@/engine/vector";
import type { PathCoordinate } from "@/engine/coordinates";

const STORAGE_KEY = "sequence-editor";

function defaultSequence(): Sequence {
  const path = new Path();
  path.curves.push(new Curve(new Vector(-2.5, 0), new Vector(-0.5, 0), new Vector(0.5, 0), new Vector(2.5, 0)));
  path.updateLength();
  const sequence = new Sequence(path);
  sequence.addElement(new BothForwardGlide(0 as PathCoordinate, 0 as PathCoordinate));
  return sequence;
}

function loadStoredSequence(): Sequence {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Sequence.fromJSON(JSON.parse(raw) as SequenceJSON);
    return defaultSequence();
  } catch (error) {
    console.error("Could not read the stored sequence:", error);
    localStorage.removeItem(STORAGE_KEY);
    return defaultSequence();
  }
}

export const useSequenceEditorStore = defineStore("sequenceEditor", () => {
  const sequence = shallowRef<Sequence>(loadStoredSequence());

  function getSequence(): Sequence {
    return sequence.value;
  }

  function setSequence(next: Sequence) {
    sequence.value = next;
    saveToStorage();
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sequence.value.toJSON()));
    } catch (error) {
      console.error("Could not store the sequence:", error);
    }
  }

  function loadFromJSON(json: SequenceJSON) {
    setSequence(Sequence.fromJSON(json));
  }

  function toJSON(): string {
    return JSON.stringify(sequence.value.toJSON(), null, 2);
  }

  function clear() {
    setSequence(defaultSequence());
  }

  return { sequence, getSequence, setSequence, saveToStorage, loadFromJSON, toJSON, clear };
});
