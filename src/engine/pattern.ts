import { Sequence } from "./sequence.js";
import type { SequenceJSON } from "./sequence.js";

/** JSON shape of a pattern, used for (de)serialization. */
export interface PatternJSON {
  name: string;
  videoUrl?: string;
  sequences: SequenceJSON[];
}

/**
 * A pattern is a named group of sequences, with an optional video reference.
 *
 * A pattern represents one move or figure shown in the diagram. It collects
 * the related sequences and can point to a video that shows how the pattern
 * is performed.
 */
export class Pattern {
  name: string;
  videoUrl?: string;
  sequences: Sequence[];

  /**
   * @param name - The name of the pattern.
   * @param sequences - The sequences that make up this pattern.
   * @param videoUrl - An optional URL to a video that shows the pattern.
   */
  constructor(name: string, sequences: Sequence[] = [], videoUrl?: string) {
    this.name = name;
    this.sequences = sequences;
    this.videoUrl = videoUrl;
  }

  /**
   * Add a sequence to this pattern.
   * @param sequence - The sequence to add.
   */
  addSequence(sequence: Sequence) {
    this.sequences.push(sequence);
  }

  /** Serialize this pattern to a plain JSON object. */
  toJSON(): PatternJSON {
    return {
      name: this.name,
      videoUrl: this.videoUrl,
      sequences: this.sequences.map((sequence) => sequence.toJSON()),
    };
  }

  /** Reconstruct a pattern from serialized data, delegating to each class. */
  static fromJSON(json: PatternJSON): Pattern {
    return new Pattern(
      json.name,
      json.sequences.map((sequence) => Sequence.fromJSON(sequence)),
      json.videoUrl,
    );
  }
}
