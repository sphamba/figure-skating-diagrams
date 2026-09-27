import type { Diagram, DiagramJSON } from "../diagram.js";
import { Sequence } from "../sequence.js";
import type { SequenceJSON } from "../sequence.js";

// Serialized state of one changed target. A step carries one part per changed
// target, so a change that spans several sequences still reverts as one step.
export type DiagramOptions = Pick<
  DiagramJSON,
  "name" | "bpm" | "videoUrl" | "backgroundImage" | "backgroundImageOpacity" | "symmetric"
>;

export type SequenceStepPart = {
  kind: "sequence";
  index: number;
  previous: SequenceJSON;
  next: SequenceJSON;
};

export type DiagramStepPart = {
  kind: "diagram";
  previous: DiagramOptions;
  next: DiagramOptions;
};

export type SequencesStepPart = {
  kind: "sequences";
  previous: SequenceJSON[];
  next: SequenceJSON[];
};

export type StepPart = SequenceStepPart | DiagramStepPart | SequencesStepPart;

export type EditStep = {
  parts: StepPart[];
  label: string;
  at: number;
  // A coalescing step may merge later same-scope commits inside the window.
  // Canvas gesture commits are never coalescing, so two separate gestures stay
  // two steps. Absent means non-coalescing in an older persisted build.
  coalescing?: boolean;
};

const PERSISTED_VERSION = 1;

type PersistedHistory = {
  version: number;
  steps: EditStep[];
  pointer: number;
};

export type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function diagramOptionsOf(json: DiagramJSON): DiagramOptions {
  return {
    name: json.name,
    bpm: json.bpm,
    videoUrl: json.videoUrl,
    backgroundImage: json.backgroundImage,
    backgroundImageOpacity: json.backgroundImageOpacity,
    symmetric: json.symmetric,
  };
}

export function diffDiagram(previous: DiagramJSON, next: DiagramJSON): StepPart[] {
  const parts: StepPart[] = [];
  const optionsBefore = diagramOptionsOf(previous);
  const optionsAfter = diagramOptionsOf(next);
  if (JSON.stringify(optionsBefore) !== JSON.stringify(optionsAfter)) {
    parts.push({ kind: "diagram", previous: optionsBefore, next: optionsAfter });
  }
  if (previous.sequences.length !== next.sequences.length) {
    parts.push({ kind: "sequences", previous: previous.sequences, next: next.sequences });
  } else {
    for (let index = 0; index < previous.sequences.length; index++) {
      if (JSON.stringify(previous.sequences[index]) !== JSON.stringify(next.sequences[index])) {
        parts.push({ kind: "sequence", index, previous: previous.sequences[index]!, next: next.sequences[index]! });
      }
    }
  }
  return parts;
}

export function applyParts(diagram: Diagram, parts: StepPart[], state: "previous" | "next"): void {
  for (const part of parts) {
    if (part.kind === "diagram") {
      const options = part[state];
      diagram.name = options.name;
      diagram.bpm = options.bpm;
      diagram.videoUrl = options.videoUrl;
      diagram.backgroundImage = options.backgroundImage;
      diagram.backgroundImageOpacity = options.backgroundImageOpacity;
      diagram.symmetric = options.symmetric;
    } else if (part.kind === "sequences") {
      diagram.sequences = part[state].map((json) => Sequence.fromJSON(json));
    } else if (part.index >= 0 && part.index < diagram.sequences.length) {
      diagram.sequences[part.index] = Sequence.fromJSON(part[state]);
    }
  }
}

// JSON-level counterpart of applyParts, so the baseline follows undo and redo
// without rebuilding live objects.
export function applyPartsToJson(json: DiagramJSON, parts: StepPart[], state: "previous" | "next"): DiagramJSON {
  const next: DiagramJSON = { ...json, sequences: [...json.sequences] };
  for (const part of parts) {
    if (part.kind === "diagram") {
      next.name = part[state].name;
      next.bpm = part[state].bpm;
      next.videoUrl = part[state].videoUrl;
      next.backgroundImage = part[state].backgroundImage;
      next.backgroundImageOpacity = part[state].backgroundImageOpacity;
      next.symmetric = part[state].symmetric;
    } else if (part.kind === "sequences") {
      next.sequences = part[state];
    } else if (part.index >= 0 && part.index < next.sequences.length) {
      next.sequences[part.index] = part[state];
    }
  }
  return next;
}

function sequenceLabels(previous: SequenceJSON, next: SequenceJSON): string[] {
  const labels: string[] = [];
  if (JSON.stringify(previous.path) !== JSON.stringify(next.path)) labels.push("Path");
  if (JSON.stringify(previous.elements) !== JSON.stringify(next.elements)) labels.push("Elements");
  if (JSON.stringify(previous.keyframes.time) !== JSON.stringify(next.keyframes.time)) labels.push("Timing");
  if (JSON.stringify(previous.annotations ?? []) !== JSON.stringify(next.annotations ?? [])) {
    labels.push("Annotations");
  }
  if ((previous.name ?? "") !== (next.name ?? "")) labels.push("Sequence name");
  if (
    (previous.traceColorL ?? "") !== (next.traceColorL ?? "") ||
    (previous.traceColorR ?? "") !== (next.traceColorR ?? "")
  ) {
    labels.push("Trace colors");
  }
  return labels;
}

export function labelOf(parts: StepPart[]): string {
  const labels: string[] = [];
  for (const part of parts) {
    if (part.kind === "diagram") {
      labels.push("Diagram options");
      continue;
    }
    if (part.kind === "sequences") {
      labels.push("Sequence list");
      continue;
    }
    const partLabels = sequenceLabels(part.previous, part.next);
    if (partLabels.length === 0) labels.push("Sequence");
    else labels.push(...partLabels);
  }
  return [...new Set(labels)].join(", ");
}

// Sequence.fromJSON throws on a missing path, keyframes or elements, so a
// tampered stored step must fail validation before any apply runs.
function isSequenceJson(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { path?: unknown; keyframes?: unknown; elements?: unknown };
  if (!candidate.path || !candidate.keyframes || !Array.isArray(candidate.elements)) return false;
  const keyframes = candidate.keyframes as { footL?: unknown; footR?: unknown; hips?: unknown; time?: unknown };
  return (
    Array.isArray(keyframes.footL) &&
    Array.isArray(keyframes.footR) &&
    Array.isArray(keyframes.hips) &&
    Array.isArray(keyframes.time)
  );
}

function isValidPart(part: unknown): part is StepPart {
  if (typeof part !== "object" || part === null) return false;
  const candidate = part as { kind?: unknown; index?: unknown; previous?: unknown; next?: unknown };
  if (candidate.kind === "diagram") {
    return (
      typeof candidate.previous === "object" &&
      candidate.previous !== null &&
      typeof candidate.next === "object" &&
      candidate.next !== null
    );
  }
  if (candidate.kind === "sequence") {
    return typeof candidate.index === "number" && isSequenceJson(candidate.previous) && isSequenceJson(candidate.next);
  }
  if (candidate.kind === "sequences") {
    return (
      Array.isArray(candidate.previous) &&
      Array.isArray(candidate.next) &&
      candidate.previous.every(isSequenceJson) &&
      candidate.next.every(isSequenceJson)
    );
  }
  return false;
}

function isValidStep(step: unknown): step is EditStep {
  if (typeof step !== "object" || step === null) return false;
  const candidate = step as Partial<EditStep>;
  if (!Array.isArray(candidate.parts) || !candidate.parts.every(isValidPart)) return false;
  return typeof candidate.label === "string" && typeof candidate.at === "number";
}

function partsMatchDiagram(diagramJson: DiagramJSON, part: StepPart, state: "previous" | "next"): boolean {
  if (part.kind === "diagram") {
    return JSON.stringify(diagramOptionsOf(diagramJson)) === JSON.stringify(part[state]);
  }
  if (part.kind === "sequences") {
    return JSON.stringify(diagramJson.sequences) === JSON.stringify(part[state]);
  }
  const sequence = diagramJson.sequences[part.index];
  return sequence !== undefined && JSON.stringify(sequence) === JSON.stringify(part[state]);
}

export class EditHistory {
  private steps: EditStep[] = [];
  private pointer = -1;
  // Serialized diagram of the last committed state, so the next commit diffs from it.
  private baseline: string | null = null;
  private lastOperation: "commit" | "undo" | "redo" | null = null;
  private capacity: number;
  private coalesceMs: number;
  private storage: HistoryStorage | null;
  private storageKey: string;
  private now: () => number;

  constructor(options?: {
    capacity?: number;
    coalesceMs?: number;
    storage?: HistoryStorage | null;
    storageKey?: string;
    now?: () => number;
  }) {
    this.capacity = options?.capacity ?? 100;
    this.coalesceMs = options?.coalesceMs ?? 500;
    this.storage = options?.storage ?? null;
    this.storageKey = options?.storageKey ?? "sequence-editor-history";
    this.now = options?.now ?? (() => Date.now());
  }

  get canUndo(): boolean {
    return this.pointer >= 0;
  }

  get canRedo(): boolean {
    return this.pointer < this.steps.length - 1;
  }

  // Records one step per committed change: the caller passes the serialized
  // diagram and the diff against the baseline becomes the step. With
  // allowCoalesce, rapid commits with the same scopes merge into one step, so
  // a slider drag makes one entry. A canvas gesture commit passes false, so
  // two separate gestures never merge.
  commit(json: string, allowCoalesce: boolean): void {
    if (this.baseline === null) {
      this.baseline = json;
      return;
    }
    if (this.baseline === json) return;
    const parts = diffDiagram(JSON.parse(this.baseline), JSON.parse(json));
    if (parts.length === 0) {
      this.baseline = json;
      return;
    }
    const time = this.now();
    const last = this.lastOperation === "commit" ? this.steps[this.pointer] : undefined;
    if (allowCoalesce && last?.coalescing && this.sameScopes(last.parts, parts) && time - last.at < this.coalesceMs) {
      for (let index = 0; index < last.parts.length; index++) {
        const target = last.parts[index]!;
        const source = parts[index]!;
        if (target.kind === "sequence" && source.kind === "sequence") target.next = source.next;
        else if (target.kind === "diagram" && source.kind === "diagram") target.next = source.next;
        else if (target.kind === "sequences" && source.kind === "sequences") target.next = source.next;
      }
      last.at = time;
      last.label = labelOf(last.parts);
    } else {
      this.steps = this.steps.slice(0, this.pointer + 1);
      this.steps.push({ parts, label: labelOf(parts), at: time, coalescing: allowCoalesce });
      this.pointer = this.steps.length - 1;
      if (this.steps.length > this.capacity) {
        this.steps.shift();
        this.pointer--;
      }
    }
    this.lastOperation = "commit";
    this.baseline = json;
    this.persist();
  }

  // Returns the step whose "previous" states the caller applies to the diagram.
  undo(): EditStep | null {
    if (this.pointer < 0) return null;
    const step = this.steps[this.pointer]!;
    this.advanceBaseline(step.parts, "previous");
    this.pointer--;
    this.lastOperation = "undo";
    this.persist();
    return step;
  }

  // Returns the step whose "next" states the caller applies to the diagram.
  redo(): EditStep | null {
    if (this.pointer >= this.steps.length - 1) return null;
    const step = this.steps[this.pointer + 1]!;
    this.advanceBaseline(step.parts, "next");
    this.pointer++;
    this.lastOperation = "redo";
    this.persist();
    return step;
  }

  // Keeps the baseline equal to the live state across undo and redo, so the
  // next commit diffs from the restored state and never bakes an undo into a
  // recorded step.
  private advanceBaseline(parts: StepPart[], state: "previous" | "next") {
    if (this.baseline === null) return;
    try {
      this.baseline = JSON.stringify(applyPartsToJson(JSON.parse(this.baseline), parts, state));
    } catch {
      this.baseline = null;
    }
  }

  // Drops the history and starts from the given state, so the first later
  // commit diffs from it. Used when a diagram is loaded or a new one is created.
  reset(json: string): void {
    this.steps = [];
    this.pointer = -1;
    this.baseline = json;
    this.lastOperation = null;
    this.persist();
  }

  clear(): void {
    this.steps = [];
    this.pointer = -1;
    this.baseline = null;
    this.lastOperation = null;
    if (this.storage) {
      try {
        this.storage.removeItem(this.storageKey);
      } catch (error) {
        console.error("Could not remove the stored edit history:", error);
      }
    }
  }

  // Restores the steps and pointer from storage across a page reload. The top
  // applied step must match the live diagram, so a stale stored history is discarded.
  rehydrate(liveJson: string): boolean {
    this.steps = [];
    this.pointer = -1;
    this.baseline = null;
    this.lastOperation = null;
    let raw: string | null = null;
    if (this.storage) {
      try {
        raw = this.storage.getItem(this.storageKey);
      } catch (error) {
        console.error("Could not read the stored edit history:", error);
        return false;
      }
    }
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as PersistedHistory;
      if (parsed.version !== PERSISTED_VERSION || !Array.isArray(parsed.steps)) return false;
      if (!parsed.steps.every(isValidStep)) return false;
      if (
        typeof parsed.pointer !== "number" ||
        !Number.isInteger(parsed.pointer) ||
        parsed.pointer < -1 ||
        parsed.pointer >= parsed.steps.length
      ) {
        return false;
      }
      if (parsed.pointer >= 0) {
        const live = JSON.parse(liveJson) as DiagramJSON;
        const top = parsed.steps[parsed.pointer]!;
        if (!top.parts.every((part) => partsMatchDiagram(live, part, "next"))) return false;
      } else if (parsed.steps.length > 0) {
        // A redo-only stack is unapplied, so its oldest step previous must match
        // the live diagram, or the stored history comes from a partial save.
        const live = JSON.parse(liveJson) as DiagramJSON;
        const oldest = parsed.steps[0]!;
        if (!oldest.parts.every((part) => partsMatchDiagram(live, part, "previous"))) return false;
      }
      this.steps = parsed.steps;
      this.pointer = parsed.pointer;
      this.baseline = liveJson;
      this.lastOperation = null;
      return true;
    } catch {
      return false;
    }
  }

  private sameScopes(a: StepPart[], b: StepPart[]): boolean {
    return a.length === b.length && a.every((part, index) => sameScope(part, b[index]!));
  }

  // A history with steps that carry large images can exceed the storage
  // quota, so the persisted copy drops the oldest steps first and the recent
  // ones survive. The in-memory history stays complete.
  private persist(): void {
    if (!this.storage) return;
    let dropped = 0;
    for (;;) {
      const persisted: PersistedHistory = {
        version: PERSISTED_VERSION,
        steps: this.steps.slice(dropped),
        pointer: Math.max(-1, this.pointer - dropped),
      };
      try {
        this.storage.setItem(this.storageKey, JSON.stringify(persisted));
        return;
      } catch (error) {
        if (dropped >= this.steps.length) {
          console.error("Could not store the edit history:", error);
          return;
        }
        dropped = dropped === 0 ? Math.ceil(this.steps.length / 2) : this.steps.length;
      }
    }
  }
}

function sameScope(a: StepPart, b: StepPart): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "sequence" && b.kind === "sequence") return a.index === b.index;
  return true;
}
