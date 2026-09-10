import { Sequence } from "./sequence.js";
import type { SequenceJSON } from "./sequence.js";

export interface DiagramJSON {
  name: string;
  sequences: SequenceJSON[];
}

export class Diagram {
  name: string;
  sequences: Sequence[];

  constructor(name: string, sequences: Sequence[] = []) {
    this.name = name;
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
      sequences: this.sequences.map((sequence) => sequence.toJSON()),
    };
  }

  static fromJSON(json: DiagramJSON): Diagram {
    return new Diagram(
      json.name ?? "Diagram",
      (json.sequences ?? []).map((sequence) => Sequence.fromJSON(sequence)),
    );
  }
}
