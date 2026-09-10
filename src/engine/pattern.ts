import { Sequence } from "./sequence.js";
import type { SequenceJSON } from "./sequence.js";

export interface PatternJSON {
  name: string;
  videoUrl?: string;
  sequences: SequenceJSON[];
}

export class Pattern {
  name: string;
  videoUrl?: string;
  sequences: Sequence[];

  constructor(name: string, sequences: Sequence[] = [], videoUrl?: string) {
    this.name = name;
    this.sequences = sequences;
    this.videoUrl = videoUrl;
  }

  addSequence(sequence: Sequence) {
    this.sequences.push(sequence);
  }

  toJSON(): PatternJSON {
    return {
      name: this.name,
      videoUrl: this.videoUrl,
      sequences: this.sequences.map((sequence) => sequence.toJSON()),
    };
  }

  static fromJSON(json: PatternJSON): Pattern {
    return new Pattern(
      json.name,
      json.sequences.map((sequence) => Sequence.fromJSON(sequence)),
      json.videoUrl,
    );
  }
}
