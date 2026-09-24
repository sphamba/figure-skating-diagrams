import { Sequence, DEFAULT_BPM, hasTimeEvolution, sequenceTimeRange } from "./sequence.js";
import type { SequenceJSON } from "./sequence.js";

export function earliestTimeKeyframeSeconds(diagram: Diagram): number | null {
  let best: number | null = null;
  for (const sequence of diagram.sequences) {
    for (const keyframe of sequence.keyframes.time) {
      if (keyframe.kind !== "time") continue;
      if (best === null || keyframe.value < best) best = keyframe.value;
    }
  }
  return best;
}

// Union of every sequence time range; null when no sequence can compute a time.
export function fullTimeExtentSeconds(sequences: Sequence[], bpm: number = DEFAULT_BPM): [number, number] | null {
  let lo: number | null = null;
  let hi: number | null = null;
  for (const sequence of sequences) {
    if (!hasTimeEvolution(sequence)) continue;
    const range = sequenceTimeRange(sequence, bpm);
    if (!range) continue;
    if (lo === null || range[0] < lo) lo = range[0];
    if (hi === null || range[1] > hi) hi = range[1];
  }
  if (lo === null || hi === null || hi <= lo) return null;
  return [lo, hi];
}

export interface DiagramJSON {
  name: string;
  bpm?: number;
  videoUrl?: string;
  backgroundImage?: string;
  backgroundImageOpacity?: number;
  sequences: SequenceJSON[];
}

export class Diagram {
  name: string;
  bpm?: number;
  videoUrl?: string;
  // Base64 data URL of the rink background image; the canvas draws it over the plain rink fill.
  backgroundImage?: string;
  // 0-1 draw opacity of the background image; 1 replaces the plain rink fill entirely.
  backgroundImageOpacity?: number;
  sequences: Sequence[];

  constructor(name: string, sequences: Sequence[] = [], bpm?: number) {
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
      videoUrl: this.videoUrl,
      backgroundImage: this.backgroundImage,
      backgroundImageOpacity: this.backgroundImageOpacity,
      sequences: this.sequences.map((sequence) => sequence.toJSON()),
    };
  }

  static fromJSON(json: DiagramJSON): Diagram {
    const diagram = new Diagram(
      json.name ?? "Diagram",
      (json.sequences ?? []).map((sequence) => Sequence.fromJSON(sequence)),
      json.bpm,
    );
    diagram.videoUrl = json.videoUrl;
    diagram.backgroundImage = json.backgroundImage;
    diagram.backgroundImageOpacity = json.backgroundImageOpacity;
    return diagram;
  }
}
