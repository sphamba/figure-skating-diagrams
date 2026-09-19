import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { Component } from "vue";
import Tooltip from "openvue/tooltip";
import type { Sequence } from "@/engine/sequence";

vi.mock("virtual:diagram-tree", () => ({
  default: { name: "diagrams", files: [], folders: [] },
}));

vi.spyOn(console, "error").mockImplementation(() => {});

const recorder = vi.hoisted(() => ({
  constructorArgs: [] as { sequences: unknown[] }[],
  hiddenSets: [] as unknown[],
  sequences: [] as unknown[],
  isProvisional: false,
  editor: null as unknown as {
    onElementChangeRequest: (element: unknown) => void;
    onTimingKeyframeChangeRequest: (keyframe: unknown, isProvisional: boolean) => void;
  },
}));

class EditorStub {
  hiddenSequences: Set<unknown> = new Set();
  occludedTop: (() => number) | null = null;

  constructor(_canvas: unknown, sequences: unknown[], options?: { occludedTop?: () => number }) {
    this.occludedTop = options?.occludedTop ?? null;
    recorder.constructorArgs.push({ sequences });
    recorder.editor = this as unknown as {
      onElementChangeRequest: (element: unknown) => void;
      onTimingKeyframeChangeRequest: (keyframe: unknown, isProvisional: boolean) => void;
    };
  }

  hiddenSequencesSize() {
    return this.hiddenSequences.size;
  }

  setHiddenSequences(next: unknown) {
    this.hiddenSequences = next;
    recorder.hiddenSets.push(next);
  }

  isProvisional() {
    return recorder.isProvisional;
  }

  getSequenceOfElement() {
    return {};
  }

  invalidateTimeCachesFor(_keyframe: unknown) {}

  refit() {}
  clearSelection() {}
  requestDraw() {}
  draw() {}
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

beforeEach(() => {
  localStorage.clear();
  recorder.constructorArgs.length = 0;
  recorder.hiddenSets.length = 0;
  recorder.sequences = [];
  recorder.isProvisional = false;
  recorder.editor = null;
});

const timedDiagramJSON = {
  name: "Timed",
  bpm: 110,
  videoUrl: "https://example.com/video.mp4",
  sequences: [
    {
      name: "Timed",
      path: { curves: [{ p0: [0, -1.2], p1: [0, -1.2], p2: [0, 1.2], p3: [0, 1.2] }] },
      elements: [],
      keyframes: {
        footL: [],
        footR: [],
        hips: [],
        time: [
          {
            kind: "TimingKeyframe",
            coordinate: 1.5,
            data: { type: "time", value: 3.75 },
            transitionIn: "linear",
            transitionOut: "linear",
          },
        ],
      },
    },
    {
      name: "Later",
      path: { curves: [{ p0: [0, -1.2], p1: [0, -1.2], p2: [0, 1.2], p3: [0, 1.2] }] },
      elements: [],
      keyframes: {
        footL: [],
        footR: [],
        hips: [],
        time: [
          {
            kind: "TimingKeyframe",
            coordinate: 1,
            data: { type: "time", value: 5 },
            transitionIn: "linear",
            transitionOut: "linear",
          },
          {
            kind: "TimingKeyframe",
            coordinate: 2,
            data: { type: "beats", value: 0.5 },
            transitionIn: "linear",
            transitionOut: "linear",
          },
        ],
      },
    },
  ],
};

test("the timing dialog commits the transition checkboxes onto the keyframe", async () => {
  const wrapper = await mountEditorView();
  await nextTick();
  const { useSequenceEditorStore } = await import("@/stores/sequenceEditor");
  const store = useSequenceEditorStore();
  store.loadFromJSON(timedDiagramJSON as never);
  await nextTick();
  await nextTick();

  const sequence = store.getDiagram().sequences[0] as Sequence;
  const keyframe = sequence.keyframes.time[0]!;
  expect(keyframe.transitionIn).toBe("linear");
  expect(keyframe.transitionOut).toBe("linear");

  recorder.editor.onTimingKeyframeChangeRequest(keyframe, false);
  await nextTick();
  await nextTick();

  const decelerate = document.getElementById("timing-decelerate-to") as HTMLInputElement;
  const accelerate = document.getElementById("timing-accelerate-from") as HTMLInputElement;
  expect(decelerate, "the decelerate checkbox should mount in the dialog").not.toBeNull();
  expect(accelerate, "the accelerate checkbox should mount in the dialog").not.toBeNull();
  expect(decelerate.checked, "both checkboxes should stay unchecked for a linear keyframe").toBe(false);
  expect(accelerate.checked).toBe(false);

  decelerate.click();
  await nextTick();

  const ok = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "OK");
  expect(ok, "the OK button of the timing dialog should mount").not.toBeUndefined();
  ok!.click();
  await nextTick();
  await nextTick();

  expect(keyframe.transitionIn, "decelerate should set the incoming transition to smooth").toBe("smooth");
  expect(keyframe.transitionOut, "the outgoing transition should stay linear").toBe("linear");

  recorder.editor.onTimingKeyframeChangeRequest(keyframe, false);
  await nextTick();
  await nextTick();
  const decelerateAgain = document.getElementById("timing-decelerate-to") as HTMLInputElement;
  const accelerateAgain = document.getElementById("timing-accelerate-from") as HTMLInputElement;
  expect(decelerateAgain.checked, "the checkboxes should prefill from the keyframe").toBe(true);
  expect(accelerateAgain.checked).toBe(false);
  wrapper.unmount();
  vi.unstubAllGlobals();
});
