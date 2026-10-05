import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Component } from "vue";
import Tooltip from "openvue/tooltip";
import { seedStoredDiagram } from "./helpers";

// Regression suite for "a new diagram keeps the old sequences on the canvas":
// the canvas editor is constructed with the mounted list, so the view must
// prime its member-identity baseline with that same list and every later
// sequences watch firing — including the empty list store.clear() delivers —
// must reach editor.setSequences.
vi.mock("virtual:diagram-tree", () => ({
  default: { name: "diagrams", files: [], folders: [] },
}));

vi.spyOn(console, "error").mockImplementation(() => {});

const recorder = vi.hoisted(() => ({
  constructorSequences: [] as unknown[][],
  startSequenceCreationCalls: [] as unknown[],
  hiddenSets: [] as unknown[],
  draws: 0,
  editor: null as unknown as Record<string, unknown>,
}));

// Editor stub that mirrors the real editor's sequences list: the constructor
// list AND every setSequences call land on `currentSequences`, so a test can
// assert what the canvas would render and keep editable.
class EditorStub {
  mode = "view";
  scaleElements = true;
  showLabels = true;
  darkMode = false;
  activeSequence: unknown = null;
  videoTimeSeconds: number | null = null;
  backgroundImageOpacity = 1;
  shortDrawRange = false;
  tracking = false;
  trackingStage: "barycenter" | "cursor" = "barycenter";
  hiddenSequences: Set<unknown> = new Set();
  pathCreationActive = false;
  onVideoTimeChange?: (seconds: number) => void;
  onTimeScrubStart?: () => void;
  onTimeScrubEnd?: () => void;
  onElementChangeRequest?: (element: unknown) => void;
  onAnnotationChangeRequest?: (annotation: unknown) => void;
  onSequenceChange?: () => void;
  onTimingKeyframeChangeRequest?: (...args: unknown[]) => void;
  onTrackingChange?: () => void;
  onPathCreationChange?: (state: unknown) => void;
  onSequenceCreationFinish?: (sequence: unknown) => void;
  onSequenceCreationCancel?: (sequence: unknown) => void;

  currentSequences: unknown[] = [];

  constructor(_canvas: unknown, sequences: unknown[], _options?: { occludedTop?: () => number }) {
    this.currentSequences = sequences;
    recorder.constructorSequences.push(sequences);
    recorder.editor = this as unknown as Record<string, unknown>;
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

  setBackgroundImage(_dataUrl: string | undefined) {}

  refit() {}
  clearSelection() {}
  requestDraw() {
    recorder.draws++;
  }
  draw() {
    recorder.draws++;
  }
  setSequences(list: unknown[]) {
    this.currentSequences = list;
  }
  startSequenceCreation(sequence: unknown) {
    this.pathCreationActive = true;
    recorder.startSequenceCreationCalls.push(sequence);
    this.onPathCreationChange?.({ sequence, isNew: true, phase: "awaitStart", curveCount: 0 });
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

beforeEach(() => {
  localStorage.clear();
  seedStoredDiagram();
  recorder.constructorSequences.length = 0;
  recorder.startSequenceCreationCalls.length = 0;
  recorder.hiddenSets.length = 0;
  recorder.draws = 0;
  recorder.editor = null;
});

// Mounting with a stored one-sequence diagram and clearing right after is the
// bug case: store.clear() delivers the first empty watch firing, which must
// reach editor.setSequences([]) instead of comparing against a stale baseline.
test("clear() right after mount reaches the canvas editor sequences", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await nextTick();

  expect(recorder.constructorSequences[0]).toHaveLength(1);

  store.clear();
  await nextTick();
  await nextTick();

  expect(store.getSequences()).toHaveLength(0);
  const stub = recorder.editor as unknown as { currentSequences: unknown[] };
  expect(stub.currentSequences).toHaveLength(0);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("clear() after loadFromJSON reaches the editor", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await nextTick();

  store.loadFromJSON({
    name: "Loaded",
    sequences: [
      {
        name: "Loaded 1",
        path: { curves: [{ points: [0, -1.2, 0, -1.2, 0, 1.2, 0, 1.2] }] },
        elements: [],
        keyframes: { footL: [], footR: [], hips: [], time: [] },
      },
    ],
  } as never);
  await nextTick();
  await nextTick();
  const stub = recorder.editor as unknown as { currentSequences: unknown[] };
  expect(stub.currentSequences).toHaveLength(1);

  store.clear();
  await nextTick();
  await nextTick();

  expect(store.getSequences()).toHaveLength(0);
  expect(stub.currentSequences).toHaveLength(0);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("clear() with a path creation active after a post-mount add reaches the editor", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  await nextTick();

  store.addSequence();
  await nextTick();
  await nextTick();
  expect(recorder.startSequenceCreationCalls).toHaveLength(1);
  const stub = recorder.editor as unknown as { currentSequences: unknown[]; pathCreationActive: boolean };
  expect(stub.currentSequences).toHaveLength(2);
  expect(stub.pathCreationActive).toBe(true);

  store.clear();
  await nextTick();
  await nextTick();

  expect(store.getSequences()).toHaveLength(0);
  expect(stub.currentSequences).toHaveLength(0);
  wrapper.unmount();
  vi.unstubAllGlobals();
});

test("clear() after an undo reaches the editor", async () => {
  const wrapper = await mountEditorView();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0]!;
  await nextTick();

  store.renameSequence(first, "Renamed");
  await nextTick();
  expect(store.undo()).not.toBeNull();
  await nextTick();
  await nextTick();
  const stub = recorder.editor as unknown as { currentSequences: unknown[] };
  expect(stub.currentSequences).toHaveLength(1);

  store.clear();
  await nextTick();
  await nextTick();

  expect(store.getSequences()).toHaveLength(0);
  expect(stub.currentSequences).toHaveLength(0);
  wrapper.unmount();
  vi.unstubAllGlobals();
});
