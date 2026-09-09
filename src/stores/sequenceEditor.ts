import { shallowRef } from "vue";
import { defineStore } from "pinia";
import { BothForwardGlide } from "@/engine/element/glide";
import { Curve } from "@/engine/curve";
import { Path } from "@/engine/path";
import { Sequence, type SequenceJSON } from "@/engine/sequence";
import { Vector } from "@/engine/vector";
import type { PathCoordinate } from "@/engine/coordinates";

/** Key of the persisted editor state in local storage. */
const STORAGE_KEY = "sequence-editor";

/** Sequence shown when nothing is stored yet (or the stored data is invalid). */
function defaultSequence(): Sequence {
  // A single straight cubic Bezier curve: 5 m long, horizontal, centered on
  // the origin. Control points are collinear, so the curve stays a line.
  const path = new Path();
  path.curves.push(new Curve(new Vector(-2.5, 0), new Vector(-0.5, 0), new Vector(0.5, 0), new Vector(2.5, 0)));
  path.updateLength();
  const sequence = new Sequence(path);
  // A two-foot glide at the very beginning of the sequence: both its start
  // and end at 0.
  sequence.addElement(new BothForwardGlide(0 as PathCoordinate, 0 as PathCoordinate));
  return sequence;
}

/** Reads and validates the stored sequence. Returns the default sequence
 * when nothing is stored or the stored JSON cannot be deserialized. */
function loadStoredSequence(): Sequence {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Sequence.fromJSON(JSON.parse(raw) as SequenceJSON);
    return defaultSequence();
  } catch (error) {
    console.error("Could not read the stored sequence:", error);
    // Drop the invalid entry so a later reload is not blocked by it.
    localStorage.removeItem(STORAGE_KEY);
    return defaultSequence();
  }
}

export const useSequenceEditorStore = defineStore("sequenceEditor", () => {
  /** The current sequence. A shallow ref keeps the raw class identity: the
   * engine mutates it in place, so deep reactivity is not needed. */
  const sequence = shallowRef<Sequence>(loadStoredSequence());

  /** The current sequence instance (for the canvas editor). */
  function getSequence(): Sequence {
    return sequence.value;
  }

  /** Replace the current sequence and store it in local storage. */
  function setSequence(next: Sequence) {
    sequence.value = next;
    saveToStorage();
  }

  /** Store the current state in local storage. */
  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sequence.value.toJSON()));
    } catch (error) {
      console.error("Could not store the sequence:", error);
    }
  }

  /** Load a sequence from a parsed JSON object and store it. */
  function loadFromJSON(json: SequenceJSON) {
    setSequence(Sequence.fromJSON(json));
  }

  /** Serialize the current state to a pretty-printed JSON string. */
  function toJSON(): string {
    return JSON.stringify(sequence.value.toJSON(), null, 2);
  }

  /** Put back the default sequence and update local storage. */
  function clear() {
    setSequence(defaultSequence());
  }

  return { sequence, getSequence, setSequence, saveToStorage, loadFromJSON, toJSON, clear };
});
