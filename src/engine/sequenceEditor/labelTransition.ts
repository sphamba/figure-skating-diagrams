import type { CanvasLabel, LabelLayer, LabelProgress } from "./label.js";

// Enter timeline: the container grows over the first portion; the text and
// connector already start appearing over its tail and run to the end. Exit
// steps the timeline back through the former windows, so the text and
// connector fade first and the container shrinks last.
export const LABEL_ENTER_MS = 160; // ms, full enter timeline
export const LABEL_EXIT_MS = 140; // ms, full exit timeline
export const LABEL_CONTAINER_PORTION = 1 / 2;
// First portion of the enter timeline where the text and connector appear:
// earlier than the end of the container window, so the content spans longer.
export const LABEL_CONTENT_PORTION = 0.3;
// Ease-out-back bounce strength, tuned low for a slight overshoot.
const BOUNCE = 1.2;
// Largest step in ms one frame may advance the enter timeline, so a stall
// cannot complete a fade in one paint.
export const STALL_MS = 100;

export type LabelVariantKey = "name" | "crossed" | "annotation" | "time" | "beat";

// Factory of one label with fresh geometry; called each frame of an exit, so
// the label follows pans, zooms and rotations while it shrinks away.
export type LabelTransitionBuild = () => CanvasLabel | null;

// Shared read-only progress of a shown label.
const SETTLED: LabelProgress = Object.freeze({ container: 1, connector: 1, text: 1 });
// Shared read-only progress of a label one step before its first paint.
const HIDDEN: LabelProgress = Object.freeze({ container: 0, connector: 0, text: 0 });

type State = {
  // Position on the enter timeline: 0 hidden, 1 shown. An exit steps it down.
  raw: number;
  // Frame tick of the last touch; a collect with a lower tick starts the exit.
  visitedAt: number;
  updatedAt: number;
  // Where and when the exit started, so the shrink never consumes an idle gap.
  exiting: boolean;
  exitStartRaw: number;
  exitStartAt: number;
  build: LabelTransitionBuild;
};

// Tracks the appear and disappear transitions of editor labels. States are
// keyed by the label owner and a variant, so a label that disappears and
// reappears within the same exit resumes instead of restarting, and every
// label paints exactly once per frame.
export class LabelTransitions {
  private states = new Map<object, Map<LabelVariantKey, State>>();
  private frame = 0;

  beginFrame(): void {
    this.frame++;
  }

  // Reports the progress for one collected label and keeps its state: a new
  // owner starts at 0, a returning one resumes its current position.
  touch(owner: object, variant: LabelVariantKey, build: LabelTransitionBuild): LabelProgress {
    let variants = this.states.get(owner);
    if (!variants) {
      variants = new Map();
      this.states.set(owner, variants);
    }
    const now = performance.now();
    const state = variants.get(variant);
    if (!state) {
      variants.set(variant, {
        raw: 0,
        visitedAt: this.frame,
        updatedAt: now,
        exiting: false,
        exitStartRaw: 0,
        exitStartAt: now,
        build,
      });
      return HIDDEN;
    }
    state.raw = Math.min(1, state.raw + Math.min(now - state.updatedAt, STALL_MS) / LABEL_ENTER_MS);
    state.updatedAt = now;
    state.visitedAt = this.frame;
    state.exiting = false;
    state.build = build;
    return this.progress(state.raw, false);
  }

  // Collects the labels that left this frame: they shrink along the exit part
  // of the timeline until it completes, then their state drops. The shrink
  // measures from the observed disappearance, so an idle gap never skips it.
  collectExit(layer: LabelLayer): void {
    const now = performance.now();
    for (const [owner, variants] of this.states) {
      for (const [variant, state] of variants) {
        if (state.visitedAt === this.frame) continue;
        if (!state.exiting) {
          state.exiting = true;
          state.exitStartRaw = state.raw;
          state.exitStartAt = now;
        }
        state.raw = Math.max(0, state.exitStartRaw - (now - state.exitStartAt) / LABEL_EXIT_MS);
        state.updatedAt = now;
        if (state.raw <= 0) {
          variants.delete(variant);
          continue;
        }
        const label = state.build();
        if (label) {
          label.setTransition(this.progress(state.raw, true));
          layer.add(label);
        }
      }
      if (variants.size === 0) this.states.delete(owner);
    }
  }

  // True while a transition still has frames to draw, so the editor keeps
  // scheduling repaints.
  animating(): boolean {
    for (const variants of this.states.values()) {
      for (const state of variants.values()) {
        if (state.visitedAt === this.frame && state.raw < 1) return true;
        if (state.visitedAt !== this.frame && state.raw > 0) return true;
      }
    }
    return false;
  }

  clear(): void {
    this.states.clear();
  }

  // Jumps every touched label to shown and drops every exit in flight, so one
  // more draw paints a settled frame. Used where no frames follow.
  finishAll(): void {
    for (const variants of this.states.values()) {
      for (const [variant, state] of variants) {
        if (state.visitedAt === this.frame) {
          state.raw = 1;
          continue;
        }
        variants.delete(variant);
      }
    }
  }

  // Phase mapping on the timeline: the container grows with a slight bounce
  // while the text already fades in and the connector grows from the center.
  // The exit still fades the content before the container shrinks, and uses
  // plain smooth curves, so a disappearing label never grows before it
  // shrinks.
  private progress(raw: number, exiting: boolean): LabelProgress {
    if (raw >= 1) return SETTLED;
    const container =
      raw <= LABEL_CONTAINER_PORTION
        ? exiting
          ? smooth(raw / LABEL_CONTAINER_PORTION)
          : backOut(raw / LABEL_CONTAINER_PORTION)
        : 1;
    const contentStart = exiting ? LABEL_CONTAINER_PORTION : LABEL_CONTENT_PORTION;
    if (raw <= contentStart) {
      return { container, connector: 0, text: 0 };
    }
    const text = smooth((raw - contentStart) / (1 - contentStart));
    const connector = exiting ? text : backOut((raw - contentStart) / (1 - contentStart));
    return { container, connector, text };
  }
}

function backOut(t: number): number {
  const s = t - 1;
  return 1 + (BOUNCE + 1) * s * s * s + BOUNCE * s * s;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
