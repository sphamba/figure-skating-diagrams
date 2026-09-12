import { DEFAULT_BPM, Sequence } from "./sequence.js";
import type { SequenceJSON } from "./sequence.js";

export interface DiagramJSON {
  name: string;
  bpm?: number;
  sequences: SequenceJSON[];
}

export class Diagram {
  name: string;
  bpm: number;
  sequences: Sequence[];

  constructor(name: string, sequences: Sequence[] = [], bpm: number = DEFAULT_BPM) {
    this.name = name;
    this.bpm = bpm;
    this.sequences = sequences;
  }

  addSequence(sequence: Sequence) {
    this.sequences.push(sequence);
  }

  removeSequence(sequence: Sequence) {
    const index = this.sequences.indexOf(sequence);
    if (index !== -1) this.sequences.splice(index, 1);
  }

  toJSON(): DiagramJSON {
    return {
      name: this.name,
      bpm: this.bpm,
      sequences: this.sequences.map((sequence) => sequence.toJSON()),
    };
  }

  static fromJSON(json: DiagramJSON): Diagram {
    return new Diagram(
      json.name ?? "Diagram",
      (json.sequences ?? []).map((sequence) => Sequence.fromJSON(sequence)),
      json.bpm ?? DEFAULT_BPM,
    );
  }
}
