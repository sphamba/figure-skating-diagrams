import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Component } from "vue";
import Tooltip from "openvue/tooltip";

vi.mock("virtual:diagram-tree", () => ({
  default: { name: "diagrams", files: [], folders: [] },
}));

vi.spyOn(console, "error").mockImplementation(() => {});

const recorder = vi.hoisted(() => ({
  constructorSequences: [] as unknown[][],
  sequences: [] as unknown[],
  hiddenSets: [] as unknown[],
  draws: 0,
  bpmAssignments: [] as number[],
  symmetricAssignments: [] as boolean[],
  backgroundImageCalls: [] as (string | undefined)[],
  editor: null as unknown as Record<string, unknown>,
}));

class EditorStub {
  mode = "view";
  scaleElements = true;
  showLabels = true;
  activeSequence: unknown = null;
  videoTimeSeconds: number | null = null;
  backgroundImageOpacity = 1;
  shortDrawRange = false;
  tracking = false;
  trackingStage: "barycenter" | "cursor" = "barycenter";
  hiddenSequences: Set<unknown> = new Set();
  onVideoTimeChange?: (seconds: number) => void;
  onTimeScrubStart?: () => void;
  onTimeScrubEnd?: () => void;
  onElementChangeRequest?: (element: unknown) => void;
  onAnnotationChangeRequest?: (annotation: unknown) => void;
  onSequenceChange?: () => void;
  onTimingKeyframeChangeRequest?: (...args: unknown[]) => void;
  onTrackingChange?: () => void;

  private _bpm = 0;
  private _symmetric = false;

  constructor(_canvas: unknown, sequences: unknown[], _options?: { occludedTop?: () => number }) {
    recorder.constructorSequences.push(sequences);
    recorder.editor = this as unknown as Record<string, unknown>;
  }

  get bpm(): number {
    return this._bpm;
  }
  set bpm(value: number) {
    this._bpm = value;
    recorder.bpmAssignments.push(value);
  }

  get symmetric(): boolean {
    return this._symmetric;
  }
  set symmetric(value: boolean) {
    this._symmetric = value;
    recorder.symmetricAssignments.push(value);
  }

  setHiddenSequences(next: Set<unknown>) {
    this.hiddenSequences = next;
    recorder.hiddenSets.push(next);
  }

  isProvisional() {
    return false;
  }

  getSequenceOfElement() {
    return null;
  }

  getSequenceOfAnnotation() {
    return null;
  }

  getSequenceOfTimingKeyframe() {
    return null;
  }

  invalidateTimeCachesFor(_keyframe: unknown) {}

  setBackgroundImage(dataUrl: string | undefined) {
    recorder.backgroundImageCalls.push(dataUrl);
  }

  refit() {}
  clearSelection() {}
  requestDraw() {
    recorder.draws++;
  }
  draw() {
    recorder.draws++;
  }
  setSequences(list: unknown[]) {
    recorder.sequences = list;
  }
  destroy() {}
}

vi.mock("@/engine/sequenceEditor/editor", async (importOriginal) => ({
  ...(await importOriginal<{ [key: symbol]: unknown }>()),
  Editor: EditorStub,
}));

vi.mock("@/engine/sequenceEditor/variantValidation", () => ({
  checkTurnVariantValidity: () => ({ left: true, forward: true, inside: false }),
  checkOneFootVariantValidity: () => ({ forward: true, inside: false }),
}));

// Stub matchMedia and ResizeObserver: jsdom does not implement them.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

async function mountEditorView() {
  vi.stubGlobal("fetch", vi.fn());
  const { default: view } = await import("@/views/EditorView.vue");
  const { default: OpenVue } = await import("openvue/config");
  const { default: ConfirmationService } = await import("openvue/confirmationservice");
  const { default: Aura } = await import("@openvue/themes/aura");
  const { definePreset } = await import("@openuxkit/themes");
  const appPreset = definePreset(Aura, { semantic: { primary: { 50: "{sky.50}" } } });
  setActivePinia(createPinia());
  const wrapper = mount(view as Component, {
    attachTo: document.body,
    global: {
      plugins: [
        [
          OpenVue,
          { theme: { preset: appPreset, options: { prefix: "p", darkModeSelector: "system", cssLayer: false } } },
        ],
        [ConfirmationService],
      ],
      directives: { tooltip: Tooltip },
      stubs: { SelectButton: true, ColorPicker: true },
    },
  });
  await nextTick();
  return wrapper;
}

const EXAMPLE_IMAGE = "data:image/png;base64,AAAA";

beforeEach(() => {
  localStorage.clear();
  recorder.constructorSequences.length = 0;
  recorder.sequences = [];
  recorder.hiddenSets.length = 0;
  recorder.draws = 0;
  recorder.bpmAssignments.length = 0;
  recorder.symmetricAssignments.length = 0;
  recorder.backgroundImageCalls.length = 0;
  recorder.editor = null;
});

test("undoing a sequence change replaces the canvas editor sequences and redraws", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0]!;
  const mountedSequences = recorder.constructorSequences[0] as unknown[];
  const mountedMember = mountedSequences[0] as { name?: string };
  const mountedName = mountedMember.name;

  store.renameSequence(first, "Circles");
  await nextTick();
  await nextTick();
  // A rename keeps the array identity, so the canvas editor keeps its sequences.
  expect(recorder.sequences).toHaveLength(0);
  const drawsBeforeUndo = recorder.draws;

  expect(store.undo()).not.toBeNull();
  await nextTick();
  await nextTick();

  expect(recorder.sequences).not.toHaveLength(0);
  expect(recorder.sequences).not.toBe(mountedSequences);
  expect(recorder.sequences[0]).not.toBe(mountedMember);
  expect((recorder.sequences[0] as { name?: string }).name).toBe(mountedName);
  expect(recorder.draws).toBeGreaterThan(drawsBeforeUndo);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("undoing a bpm change runs the bpm watch and redraws the canvas", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();

  store.setDiagramBpm(90);
  await nextTick();
  await nextTick();
  expect(recorder.bpmAssignments[recorder.bpmAssignments.length - 1]).toBe(90);
  const drawsBeforeUndo = recorder.draws;

  expect(store.undo()).not.toBeNull();
  await nextTick();
  await nextTick();

  // The bpm falls back to the default 120 through getBpm when it leaves the diagram.
  expect(recorder.bpmAssignments[recorder.bpmAssignments.length - 1]).toBe(120);
  expect(recorder.draws).toBeGreaterThan(drawsBeforeUndo);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("undoing a symmetric toggle runs the symmetric watch and requests a draw", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();

  store.setDiagramSymmetric(true);
  await nextTick();
  await nextTick();
  expect(recorder.symmetricAssignments[recorder.symmetricAssignments.length - 1]).toBe(true);
  const drawsBeforeUndo = recorder.draws;

  expect(store.undo()).not.toBeNull();
  await nextTick();
  await nextTick();

  expect(recorder.symmetricAssignments[recorder.symmetricAssignments.length - 1]).toBe(false);
  expect(recorder.draws).toBeGreaterThan(drawsBeforeUndo);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("undoing a background image clears it on the canvas editor", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();

  store.setDiagramBackgroundImage(EXAMPLE_IMAGE);
  await nextTick();
  await nextTick();
  expect(recorder.backgroundImageCalls[recorder.backgroundImageCalls.length - 1]).toBe(EXAMPLE_IMAGE);

  expect(store.undo()).not.toBeNull();
  await nextTick();
  await nextTick();

  expect(recorder.backgroundImageCalls[recorder.backgroundImageCalls.length - 1]).toBeUndefined();
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the canvas editor follows every rebuild including redo", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0]!;
  const formerName = first.name;
  const mountedMember = (recorder.constructorSequences[0] as unknown[])[0];

  store.renameSequence(first, "Circles");
  await nextTick();
  await nextTick();
  expect(store.undo()).not.toBeNull();
  await nextTick();
  await nextTick();
  const afterUndo = recorder.sequences;
  expect(afterUndo).not.toHaveLength(0);
  expect(afterUndo).not.toBe((recorder.constructorSequences[0] as unknown[]));
  expect(afterUndo[0]).not.toBe(mountedMember);
  expect((afterUndo[0] as { name?: string }).name).toBe(formerName);

  expect(store.redo()).not.toBeNull();
  await nextTick();
  await nextTick();
  // The redo rebuilds too, so the watch fires again with a fresh array.
  expect(recorder.sequences).not.toBe(afterUndo);
  expect(recorder.sequences[0]).not.toBe(afterUndo[0]);
  expect((recorder.sequences[0] as { name?: string }).name).toBe("Circles");

  store.renameSequence(store.getSequences()[0]!, "Spirals");
  await nextTick();
  await nextTick();
  const afterSecondUndo = recorder.sequences;
  expect(store.undo()).not.toBeNull();
  await nextTick();
  await nextTick();
  expect(recorder.sequences).not.toBe(afterSecondUndo);
  expect((recorder.sequences[0] as { name?: string }).name).toBe("Circles");
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("ctrl+z and ctrl+y do nothing while the element dialog is open", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0]!;
  store.renameSequence(first, "Circles");
  await nextTick();
  await nextTick();

  recorder.editor.onElementChangeRequest({
    type: "LeftForwardInsideThreeTurn",
    shortName: "LFI-3T",
    start: 0,
    end: 1,
  });
  await nextTick();
  await nextTick();
  expect(document.getElementById("element-short-name"), "the element dialog should be open").not.toBeNull();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true }));
  await nextTick();
  await nextTick();
  expect((store.getSequences()[0] as Sequence).name).toBe("Circles");
  expect(store.canUndo).toBe(true);
  expect(store.canRedo).toBe(false);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("ctrl+z and ctrl+y do nothing while the timing dialog is open", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0]!;
  store.renameSequence(first, "Circles");
  await nextTick();
  await nextTick();

  recorder.editor.onTimingKeyframeChangeRequest(
    { kind: "time", value: 0, pathCoordinate: 0, transitionIn: "linear", transitionOut: "linear" },
    false,
    null,
  );
  await nextTick();
  await nextTick();
  expect(document.getElementById("timing-value"), "the timing dialog should be open").not.toBeNull();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true }));
  await nextTick();
  await nextTick();
  expect((store.getSequences()[0] as Sequence).name).toBe("Circles");
  expect(store.canUndo).toBe(true);
  expect(store.canRedo).toBe(false);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("the floating undo and redo buttons drive the store", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0]!;
  const formerName = first.name;
  store.renameSequence(first, "Circles");
  await nextTick();
  await nextTick();

  const undoButton = wrapper.find("button[aria-label='Undo the last change']");
  expect(undoButton.exists()).toBe(true);
  expect(undoButton.attributes("disabled")).toBeUndefined();
  await undoButton.trigger("click");
  await nextTick();
  await nextTick();
  expect((store.getSequences()[0] as Sequence).name).toBe(formerName);
  expect(store.canRedo).toBe(true);

  const redoButton = wrapper.find("button[aria-label='Redo the last undone change']");
  expect(redoButton.exists()).toBe(true);
  expect(redoButton.attributes("disabled")).toBeUndefined();
  await redoButton.trigger("click");
  await nextTick();
  await nextTick();
  expect((store.getSequences()[0] as Sequence).name).toBe("Circles");
  expect(store.canRedo).toBe(false);
  wrapper.unmount();
  vi.unstubAllGlobals();
});
